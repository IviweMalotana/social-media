using Hangfire;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Jobs;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record CreateVerticalRequest(string Name, string? Category, string? Notes, string? Cadence);

public record UpdateVerticalRequest(
    string? Name, string? Category, string? Notes, string? Cadence, bool? Pinned);

/// <summary>
/// Buyer intelligence: micro-verticals BDP sells into, each with recurring
/// web-research briefs (identity language, struggles, content angles, ad
/// patterns, popping brands, the BDP play). The research itself runs in
/// IntelRefreshJob so requests return immediately; the UI polls status.
/// </summary>
[ApiController]
[Route("api/intel")]
[Authorize]
public class IntelController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<object> List()
    {
        var workspaceId = User.WorkspaceId();
        var verticals = await db.BuyerVerticals
            .Where(v => v.WorkspaceId == workspaceId)
            .OrderBy(v => v.Category).ThenBy(v => v.Name)
            .Select(v => new
            {
                v.Id, v.Name, v.Category, v.Notes, v.Cadence, v.Pinned,
                v.LastResearchedAt, v.ResearchStatus, v.LastError,
                briefCount = v.Briefs.Count,
                latestBriefId = v.Briefs
                    .OrderByDescending(b => b.CreatedAt)
                    .Select(b => (Guid?)b.Id).FirstOrDefault(),
            })
            .ToListAsync();
        return verticals;
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var vertical = await db.BuyerVerticals
            .FirstOrDefaultAsync(v => v.Id == id && v.WorkspaceId == workspaceId);
        if (vertical is null) return NotFound();

        var latest = await db.IntelBriefs
            .Where(b => b.BuyerVerticalId == id)
            .OrderByDescending(b => b.CreatedAt)
            .FirstOrDefaultAsync();

        return Ok(new
        {
            vertical.Id, vertical.Name, vertical.Category, vertical.Notes,
            vertical.Cadence, vertical.Pinned, vertical.LastResearchedAt,
            vertical.ResearchStatus, vertical.LastError,
            latestBrief = latest is null ? null : new
            {
                latest.Id, latest.BriefJson, latest.SourcesJson, latest.Model, latest.CreatedAt,
            },
        });
    }

    [HttpGet("{id:guid}/briefs")]
    public async Task<object> BriefHistory(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        return await db.IntelBriefs
            .Where(b => b.BuyerVerticalId == id && b.WorkspaceId == workspaceId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new { b.Id, b.Model, b.CreatedAt })
            .ToListAsync();
    }

    [HttpGet("briefs/{briefId:guid}")]
    public async Task<IActionResult> GetBrief(Guid briefId)
    {
        var workspaceId = User.WorkspaceId();
        var brief = await db.IntelBriefs
            .FirstOrDefaultAsync(b => b.Id == briefId && b.WorkspaceId == workspaceId);
        return brief is null ? NotFound() : Ok(new
        {
            brief.Id, brief.BuyerVerticalId, brief.BriefJson, brief.SourcesJson,
            brief.Model, brief.CreatedAt,
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateVerticalRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Name is required." });

        var vertical = new BuyerVertical
        {
            WorkspaceId = User.WorkspaceId(),
            Name = request.Name.Trim(),
            Category = request.Category?.Trim() ?? "",
            Notes = request.Notes?.Trim() ?? "",
            Cadence = NormalizeCadence(request.Cadence),
        };
        db.BuyerVerticals.Add(vertical);
        await db.SaveChangesAsync();
        return Ok(vertical);
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateVerticalRequest request)
    {
        var workspaceId = User.WorkspaceId();
        var vertical = await db.BuyerVerticals
            .FirstOrDefaultAsync(v => v.Id == id && v.WorkspaceId == workspaceId);
        if (vertical is null) return NotFound();

        if (request.Name is { Length: > 0 }) vertical.Name = request.Name.Trim();
        if (request.Category is not null) vertical.Category = request.Category.Trim();
        if (request.Notes is not null) vertical.Notes = request.Notes.Trim();
        if (request.Cadence is not null) vertical.Cadence = NormalizeCadence(request.Cadence);
        if (request.Pinned is { } pinned) vertical.Pinned = pinned;
        await db.SaveChangesAsync();
        return Ok(vertical);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var vertical = await db.BuyerVerticals
            .FirstOrDefaultAsync(v => v.Id == id && v.WorkspaceId == workspaceId);
        if (vertical is null) return NotFound();
        db.BuyerVerticals.Remove(vertical);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Queues a research pull for one vertical. Returns 202 immediately — the
    /// pull takes a few minutes (real web search) — and the UI polls status.
    /// </summary>
    [HttpPost("{id:guid}/research")]
    public async Task<IActionResult> Research(
        Guid id,
        [FromServices] IntelResearcher researcher,
        [FromServices] IBackgroundJobClient jobs)
    {
        if (!researcher.IsConfigured)
            return StatusCode(503, new { error = "Research needs Anthropic__ApiKey on the API service." });

        var workspaceId = User.WorkspaceId();
        var vertical = await db.BuyerVerticals
            .FirstOrDefaultAsync(v => v.Id == id && v.WorkspaceId == workspaceId);
        if (vertical is null) return NotFound();
        if (vertical.ResearchStatus == "running")
            return Conflict(new { error = "Research already running for this vertical." });

        vertical.ResearchStatus = "queued";
        vertical.LastError = null;
        await db.SaveChangesAsync();
        jobs.Enqueue<IntelRefreshJob>(job => job.ResearchOneAsync(id));
        return Accepted(new { status = "queued" });
    }

    /// <summary>
    /// Seeds the starter verticals from the buyer map's highest-value targets.
    /// Skips names that already exist, so it's safe to run repeatedly.
    /// </summary>
    [HttpPost("seed")]
    public async Task<IActionResult> Seed()
    {
        var workspaceId = User.WorkspaceId();
        var existing = await db.BuyerVerticals
            .Where(v => v.WorkspaceId == workspaceId)
            .Select(v => v.Name).ToListAsync();

        var seeds = new (string Name, string Category, string Notes)[]
        {
            ("Founders starting a perfume brand", "Fragrance",
             "Formats: atomizers, 10ml roll-ons, sample vials. 10-unit MOQ is the unlock — most suppliers want 500+. Countless people want to start a perfume line; huge campaign surface."),
            ("Founders starting a haircare line", "Hair care",
             "Formats: large pumps for shampoo/conditioner, droppers for hair oil. Education play: sell shampoo+conditioner as 2-bottle sets, order both formats together, price the set for margin."),
            ("Skincare founders launching serums", "Beauty & Personal Care",
             "Formats: amber glass droppers, airless pumps. Core segment — Etsy origin base. Vitamin C / retinol stories fit amber + airless."),
            ("Candle makers buying fragrance-oil packaging", "Fragrance",
             "B2B input packaging: amber droppers and small bottles for their fragrance oils. Education-first angle."),
            ("Tattoo studios launching aftercare brands", "Medical / Practitioner",
             "Formats: pump balms, amber droppers for wash. Young, fast-growing market. SA top-10 target."),
            ("Anointing oil producers (churches, ministries)", "Religious / Ceremonial",
             "Formats: small droppers, amber bottles. Serious recurring volume. SA top-10 target."),
            ("Aesthetic & dermatology clinics building private label", "Spa & Aesthetic",
             "Formats: airless pumps, amber droppers. 60%+ margin private-label ranges. SA top-10 target."),
            ("Safari lodges & boutique hotels branding amenities", "Hospitality",
             "Formats: 35-50ml amenity bottles, dispensers. Signature ranges; big amenity budgets. SA top-10 target."),
            ("Craft food producers (oils, hot sauce, bitters)", "Food & Beverage",
             "Formats: pour bottles, dasher bottles, amber glass. Huge SA scene. SA top-10 target."),
            ("Wedding & corporate gifting producers", "Gifting & Events",
             "Formats: 30ml minis, roll-ons, kit bottles. Recurring seasonal orders. SA top-10 target."),
        };

        var added = 0;
        foreach (var (name, category, notes) in seeds)
        {
            if (existing.Contains(name)) continue;
            db.BuyerVerticals.Add(new BuyerVertical
            {
                WorkspaceId = workspaceId,
                Name = name,
                Category = category,
                Notes = notes,
            });
            added++;
        }
        await db.SaveChangesAsync();
        return Ok(new { added });
    }

    private static string NormalizeCadence(string? cadence) =>
        cadence is "daily" or "manual" ? cadence : "weekly";
}
