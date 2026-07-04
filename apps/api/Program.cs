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
builder.Services.AddSingleton<ITokenVault, AesGcmTokenVault>();
builder.Services.AddSingleton<ISocialPlatformAdapter, FacebookAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, InstagramAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, TikTokAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, PinterestAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, WhatsAppAdapter>();
builder.Services.AddSingleton<ISocialPlatformAdapter, GoogleAdsAdapter>();
builder.Services.AddSingleton<AdapterRegistry>();

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

// Dev only: create the schema on the fly. Real environments use EF migrations.
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsRelational()) db.Database.EnsureCreated();
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHangfireDashboard("/hangfire");
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Recurring sweep: keep connected-account tokens fresh and health flags accurate.
RecurringJob.AddOrUpdate<TokenHealthSweepJob>(
    "token-health-sweep", job => job.RunAsync(), Cron.Hourly);

app.Run();
