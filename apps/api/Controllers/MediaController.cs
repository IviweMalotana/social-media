using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

public record MediaAssetDto(
    Guid Id, string FileName, string ContentType, long SizeBytes, string Url, DateTimeOffset CreatedAt);

/// <summary>
/// Media library. Phase 0/1 stores files on local disk under wwwroot/media so they are
/// publicly reachable (platforms fetch media by URL when publishing). Object storage
/// (R2/S3) replaces the disk in production — only StorageKey handling changes.
/// </summary>
[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController(AppDbContext db, IWebHostEnvironment env, IConfiguration config) : ControllerBase
{
    private static readonly Dictionary<string, string> AllowedTypes = new()
    {
        ["image/jpeg"] = ".jpg",
        ["image/png"] = ".png",
        ["image/gif"] = ".gif",
        ["image/webp"] = ".webp",
        ["video/mp4"] = ".mp4",
        ["video/quicktime"] = ".mov",
    };

    private const long MaxSizeBytes = 200 * 1024 * 1024; // TikTok-sized videos need headroom

    [HttpGet]
    public async Task<IReadOnlyList<MediaAssetDto>> List()
    {
        var workspaceId = User.WorkspaceId();
        return (await db.MediaAssets
                .Where(m => m.WorkspaceId == workspaceId)
                .OrderByDescending(m => m.CreatedAt)
                .Take(200)
                .ToListAsync())
            .Select(ToDto)
            .ToList();
    }

    [HttpPost]
    [RequestSizeLimit(MaxSizeBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxSizeBytes)]
    public async Task<ActionResult<MediaAssetDto>> Upload(IFormFile file)
    {
        if (file.Length == 0)
            return BadRequest(new { error = "The file is empty." });
        if (!AllowedTypes.TryGetValue(file.ContentType, out var extension))
            return BadRequest(new { error = $"Unsupported type '{file.ContentType}'. Allowed: images (jpeg/png/gif/webp) and videos (mp4/mov)." });

        var storageKey = $"{Guid.NewGuid():N}{extension}";
        var directory = Path.Combine(env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "media");
        Directory.CreateDirectory(directory);
        await using (var stream = System.IO.File.Create(Path.Combine(directory, storageKey)))
        {
            await file.CopyToAsync(stream);
        }

        var asset = new MediaAsset
        {
            WorkspaceId = User.WorkspaceId(),
            FileName = Path.GetFileName(file.FileName),
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            StorageKey = storageKey,
        };
        db.MediaAssets.Add(asset);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(List), ToDto(asset));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var workspaceId = User.WorkspaceId();
        var asset = await db.MediaAssets.FirstOrDefaultAsync(m => m.Id == id && m.WorkspaceId == workspaceId);
        if (asset is null) return NotFound();

        var inUse = await db.Posts.AnyAsync(p =>
            p.WorkspaceId == workspaceId &&
            (p.Status == PostStatus.Scheduled || p.Status == PostStatus.Publishing) &&
            p.MediaAssetIds.Contains(asset.Id.ToString()));
        if (inUse)
            return Conflict(new { error = "This file is attached to a scheduled post — cancel the post first." });

        var path = Path.Combine(
            env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot"), "media", asset.StorageKey);
        if (System.IO.File.Exists(path)) System.IO.File.Delete(path);

        db.MediaAssets.Remove(asset);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // Absolute URL: platforms fetch media by URL and the dashboard may live on another origin.
    private MediaAssetDto ToDto(MediaAsset asset) => new(
        asset.Id, asset.FileName, asset.ContentType, asset.SizeBytes,
        $"{(config["App:BaseUrl"] ?? "http://localhost:5128").TrimEnd('/')}/media/{asset.StorageKey}",
        asset.CreatedAt);
}
