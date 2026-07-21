using System.Text;
using Hangfire;
using Hangfire.InMemory;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Jobs;
using SocialMedia.Api.Platforms;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Default");

if (!builder.Environment.IsDevelopment() && string.IsNullOrEmpty(builder.Configuration["Jwt:Key"]))
    throw new InvalidOperationException(
        "Jwt:Key is required outside Development. Generate one with: openssl rand -base64 48");

// Database — Postgres in real environments, in-memory when no connection string is
// configured so the API runs locally with zero setup.
builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (!string.IsNullOrEmpty(connectionString))
        options.UseNpgsql(connectionString);
    else
        options.UseInMemoryDatabase("social-media-dev");
});

// Background jobs — same fallback strategy as the database.
builder.Services.AddHangfire(config =>
{
    config.SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
        .UseSimpleAssemblyNameTypeSerializer()
        .UseRecommendedSerializerSettings();
    if (!string.IsNullOrEmpty(connectionString))
        config.UsePostgreSqlStorage(o => o.UseNpgsqlConnection(connectionString));
    else
        config.UseInMemoryStorage();
});
builder.Services.AddHangfireServer();

// Token vault + platform adapters.
builder.Services.AddHttpClient("meta");
builder.Services.AddHttpClient("tiktok");
builder.Services.AddHttpClient("pinterest");
builder.Services.AddSingleton<MetaGraphClient>();
builder.Services.AddSingleton<ITokenVault, AesGcmTokenVault>();
builder.Services.AddSingleton<ISocialPlatformAdapter, FacebookAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, InstagramAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, TikTokAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, PinterestAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, WhatsAppAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, GoogleAdsAdapter>();
builder.Services.AddSingleton<AdapterRegistry>();

// AI caption generation (enabled when Anthropic:ApiKey is configured).
builder.Services.AddSingleton<SocialMedia.Api.Services.ContentGenerator>();
// Buyer-vertical research via web search (same Anthropic:ApiKey gate).
builder.Services.AddSingleton<SocialMedia.Api.Services.IntelResearcher>();

// Outbound email — Resend HTTPS API in production (cloud hosts block SMTP ports).
builder.Services.AddHttpClient("resend");
if (!string.IsNullOrEmpty(builder.Configuration["Resend:ApiKey"]))
    builder.Services.AddSingleton<SocialMedia.Api.Services.IEmailTransport,
        SocialMedia.Api.Services.ResendEmailTransport>();
else
    builder.Services.AddSingleton<SocialMedia.Api.Services.IEmailTransport,
        SocialMedia.Api.Services.NullEmailTransport>();
builder.Services.AddScoped<SocialMedia.Api.Services.EmailService>();

// Auth.
builder.Services.AddSingleton<JwtTokenService>();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "social-media",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "social-media",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(JwtTokenService.GetSigningKey(builder.Configuration))),
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .WithOrigins(builder.Configuration["App:WebOrigin"] ?? "http://localhost:5173")
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

// Schema: EF migrations, applied automatically in Development or when
// Database:AutoCreate=true. Handles the pre-migrations era too — the first production
// deploy created the schema via EnsureCreated (no migrations history), so if tables
// exist without a history table we baseline InitialCreate as already applied.
if (app.Environment.IsDevelopment() || app.Configuration.GetValue("Database:AutoCreate", false))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsRelational())
        MigrationBootstrap.Apply(db, scope.ServiceProvider.GetRequiredService<ILogger<Program>>());
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHangfireDashboard("/hangfire");
}

app.UseStaticFiles(); // serves uploaded media from wwwroot/media — platforms fetch it by URL
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// TikTok domain verification. The static file in wwwroot covers this; the explicit
// endpoint is a safety net (static middleware answers first, so this only fires if
// the file is ever missing from a deploy).
app.MapGet("/tiktokgbV5eANK6HoNlIJyT62itapS8DDX9mlE.txt",
    () => Results.Text("tiktok-developers-site-verification=gbV5eANK6HoNlIJyT62itapS8DDX9mlE",
        "text/plain"));

// Recurring sweeps: token freshness hourly, post insights every 6 hours.
// Resolved from DI (never the static RecurringJob API): the static path reads
// JobStorage.Current, which isn't initialized until Hangfire's hosted service starts —
// it happened to work in Development only because UseHangfireDashboard initialized it.
using (var scope = app.Services.CreateScope())
{
    var recurringJobs = scope.ServiceProvider.GetRequiredService<IRecurringJobManager>();
    recurringJobs.AddOrUpdate<TokenHealthSweepJob>(
        "token-health-sweep", job => job.RunAsync(), Cron.Hourly);
    recurringJobs.AddOrUpdate<InsightsSweepJob>(
        "insights-sweep", job => job.RunAsync(), "0 */6 * * *");
    // Campaign send engine: every 15 minutes; the job itself enforces send windows,
    // batch size, jitter, and every EmailService guardrail.
    recurringJobs.AddOrUpdate<CampaignSendJob>(
        "campaign-send", job => job.RunAsync(), "*/15 * * * *");
    // Buyer intel pulls: every 6 hours, offset from the insights sweep. The job
    // itself enforces cadence (daily/weekly per vertical) and a per-run cap.
    recurringJobs.AddOrUpdate<IntelRefreshJob>(
        "intel-refresh", job => job.RunAsync(), "30 */6 * * *");
    // Weekly discovery: hunt the web for buyer types NOT on the list yet; results
    // land as suggestions awaiting human approval. Mondays 04:15 UTC.
    recurringJobs.AddOrUpdate<IntelRefreshJob>(
        "intel-discover", job => job.DiscoverAllAsync(), "15 4 * * 1");
}

app.Run();
