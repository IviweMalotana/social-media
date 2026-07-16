using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record GenerateArticleRequest(string Topic, string Keyword, string Audience, string? Notes);

public record UpdateArticleRequest(
    string? Title, string? Slug, string? Keyword, string? MetaDescription,
    string? BodyMarkdown, string? Status, string? PublishedUrl, int? MonthlySessions);

[ApiController]
[Route("api/articles")]
[Authorize]
public partial class ArticlesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List()
    {
        var workspaceId = User.WorkspaceId();
        var articles = await db.Articles
            .Where(a => a.WorkspaceId == workspaceId)
            .OrderByDescending(a => a.CreatedAt)
            .Take(200)
            .ToListAsync();

        // Which articles work: pin clicks are attributed by matching each published
        // Pinterest pin's destination link against the article's slug/URL.
        var pins = await db.PostTargets
            .Where(t => t.Post!.WorkspaceId == workspaceId &&
                        t.Platform == Platform.Pinterest && t.OptionsJson != null)
            .Select(t => new { t.OptionsJson, t.Clicks })
            .ToListAsync();

        // Word count computed client-side — Split doesn't translate to SQL.
        return articles.Select(a => new
        {
            a.Id, a.Title, a.Slug, a.Keyword, a.Audience, a.Status,
            a.GeneratedByAi, a.CreatedAt, a.UpdatedAt,
            a.PublishedUrl, a.PublishedAt, a.MonthlySessions,
            words = a.BodyMarkdown.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length,
            pinClicks = a.Slug.Length == 0 ? 0 : pins
                .Where(p => p.OptionsJson!.Contains(a.Slug) ||
                            (a.PublishedUrl is { Length: > 0 } url && p.OptionsJson!.Contains(url)))
                .Sum(p => p.Clicks),
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var article = await FindAsync(id);
        return article is null ? NotFound() : Ok(article);
    }

    /// <summary>
    /// Generates a draft with Claude (503 when Anthropic__ApiKey isn't configured).
    /// The draft may contain [bracketed placeholders] where the model needed a fact
    /// it didn't have — that's the honesty gate, fill them in the editor.
    /// </summary>
    [HttpPost("generate")]
    public async Task<IActionResult> Generate(
        GenerateArticleRequest request, [FromServices] ContentGenerator generator, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Topic))
            return BadRequest(new { error = "Topic is required." });
        if (!generator.IsConfigured)
            return StatusCode(503, new { error = "Article generation needs Anthropic__ApiKey on the API service." });

        var keyword = string.IsNullOrWhiteSpace(request.Keyword) ? request.Topic.Trim() : request.Keyword.Trim();
        var generated = await generator.GenerateArticleAsync(
            request.Topic.Trim(), keyword,
            string.IsNullOrWhiteSpace(request.Audience) ? "small skincare brands" : request.Audience.Trim(),
            request.Notes, ct);

        var article = new Article
        {
            WorkspaceId = User.WorkspaceId(),
            Title = generated.Title,
            Slug = Slugify(generated.Slug.Length > 0 ? generated.Slug : generated.Title),
            Keyword = keyword,
            MetaDescription = generated.MetaDescription,
            Audience = request.Audience?.Trim() ?? "",
            BodyMarkdown = generated.BodyMarkdown,
            GeneratedByAi = true,
        };
        db.Articles.Add(article);
        await db.SaveChangesAsync(ct);
        return Ok(article);
    }

    /// <summary>Blank article for writing by hand.</summary>
    [HttpPost]
    public async Task<IActionResult> Create(UpdateArticleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            return BadRequest(new { error = "Title is required." });
        var article = new Article
        {
            WorkspaceId = User.WorkspaceId(),
            Title = request.Title.Trim(),
            Slug = Slugify(request.Slug is { Length: > 0 } s ? s : request.Title),
            Keyword = request.Keyword?.Trim() ?? "",
            MetaDescription = request.MetaDescription?.Trim() ?? "",
            BodyMarkdown = request.BodyMarkdown ?? "",
        };
        db.Articles.Add(article);
        await db.SaveChangesAsync();
        return Ok(article);
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateArticleRequest request)
    {
        var article = await FindAsync(id);
        if (article is null) return NotFound();

        if (request.Title is { Length: > 0 }) article.Title = request.Title.Trim();
        if (request.Slug is { Length: > 0 }) article.Slug = Slugify(request.Slug);
        if (request.Keyword is not null) article.Keyword = request.Keyword.Trim();
        if (request.MetaDescription is not null) article.MetaDescription = request.MetaDescription.Trim();
        if (request.BodyMarkdown is not null) article.BodyMarkdown = request.BodyMarkdown;
        if (request.PublishedUrl is not null)
            article.PublishedUrl = request.PublishedUrl.Trim().Length == 0 ? null : request.PublishedUrl.Trim();
        if (request.MonthlySessions is { } sessions) article.MonthlySessions = Math.Max(0, sessions);
        if (request.Status is "draft" or "ready" or "published")
        {
            article.Status = request.Status;
            if (request.Status == "published") article.PublishedAt ??= DateTimeOffset.UtcNow;
        }
        article.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Ok(article);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var article = await FindAsync(id);
        if (article is null) return NotFound();
        db.Articles.Remove(article);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Markdown export with front matter, ready for the shop's blog.</summary>
    [HttpGet("{id:guid}/export")]
    public async Task<IActionResult> Export(Guid id)
    {
        var article = await FindAsync(id);
        if (article is null) return NotFound();
        var markdown = $"""
            ---
            title: "{article.Title.Replace("\"", "\\\"")}"
            slug: {article.Slug}
            description: "{article.MetaDescription.Replace("\"", "\\\"")}"
            keyword: {article.Keyword}
            ---

            {article.BodyMarkdown}
            """;
        return File(System.Text.Encoding.UTF8.GetBytes(markdown), "text/markdown", $"{article.Slug}.md");
    }

    internal static string Slugify(string input)
    {
        var slug = SlugInvalid().Replace(input.Trim().ToLowerInvariant(), "-").Trim('-');
        return SlugDashes().Replace(slug, "-");
    }

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex SlugInvalid();

    [GeneratedRegex(@"-{2,}")]
    private static partial Regex SlugDashes();

    private async Task<Article?> FindAsync(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        return await db.Articles.FirstOrDefaultAsync(a => a.Id == id && a.WorkspaceId == workspaceId);
    }
}
