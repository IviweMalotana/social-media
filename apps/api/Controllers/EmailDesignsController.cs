using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record SaveEmailDesignRequest(
    string Name, string? Subject, string? Preheader, string? BrandJson, string? BlocksJson);

public record PreviewEmailDesignRequest(string? Preheader, string? BrandJson, string? BlocksJson);

/// <summary>
/// Designed (Lemme-style) marketing emails: saved block layouts + brand tokens.
/// Rendering happens server-side so the preview, the test send, and the real send
/// are guaranteed to be the same bytes.
/// </summary>
[ApiController]
[Route("api/email-designs")]
[Authorize]
public class EmailDesignsController(AppDbContext db, IConfiguration config) : ControllerBase
{
    [HttpGet]
    public async Task<object> List()
    {
        var workspaceId = User.WorkspaceId();
        return await db.EmailDesigns
            .Where(d => d.WorkspaceId == workspaceId)
            .OrderByDescending(d => d.UpdatedAt)
            .Select(d => new { d.Id, d.Name, d.Subject, d.UpdatedAt })
            .Take(100)
            .ToListAsync();
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var design = await FindAsync(id);
        return design is null ? NotFound() : Ok(design);
    }

    [HttpPost]
    public async Task<IActionResult> Create(SaveEmailDesignRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Name is required." });
        var design = new EmailDesign
        {
            WorkspaceId = User.WorkspaceId(),
            Name = request.Name.Trim(),
            Subject = request.Subject?.Trim() ?? "",
            Preheader = request.Preheader?.Trim() ?? "",
            BrandJson = request.BrandJson ?? "{}",
            BlocksJson = request.BlocksJson ?? "[]",
        };
        db.EmailDesigns.Add(design);
        await db.SaveChangesAsync();
        return Ok(design);
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, SaveEmailDesignRequest request)
    {
        var design = await FindAsync(id);
        if (design is null) return NotFound();
        if (request.Name is { Length: > 0 }) design.Name = request.Name.Trim();
        if (request.Subject is not null) design.Subject = request.Subject.Trim();
        if (request.Preheader is not null) design.Preheader = request.Preheader.Trim();
        if (request.BrandJson is not null) design.BrandJson = request.BrandJson;
        if (request.BlocksJson is not null) design.BlocksJson = request.BlocksJson;
        design.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return Ok(design);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var design = await FindAsync(id);
        if (design is null) return NotFound();
        db.EmailDesigns.Remove(design);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Renders unsaved editor state — powers the live preview iframe.</summary>
    [HttpPost("preview")]
    public IActionResult Preview(PreviewEmailDesignRequest request)
    {
        var (html, text) = EmailDesigner.Render(
            request.Preheader ?? "", request.BrandJson ?? "{}", request.BlocksJson ?? "[]",
            config["Email:FromName"] ?? "Be Different Packaging",
            config["Email:PhysicalAddress"]);
        return Ok(new { html, text });
    }

    private async Task<EmailDesign?> FindAsync(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        return await db.EmailDesigns.FirstOrDefaultAsync(d => d.Id == id && d.WorkspaceId == workspaceId);
    }
}
