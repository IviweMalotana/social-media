using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

public record GenerateContentRequest(
    string Topic,
    string? Tone,
    List<Platform> Platforms,
    int? VariantsPerPlatform);

[ApiController]
[Route("api/content")]
[Authorize]
public class ContentController(ContentGenerator generator, ILogger<ContentController> logger) : ControllerBase
{
    [HttpPost("generate")]
    public async Task<ActionResult<object>> Generate(GenerateContentRequest request, CancellationToken ct)
    {
        if (!generator.IsConfigured)
            return StatusCode(503, new
            {
                error = "AI caption generation isn't configured yet — set the Anthropic__ApiKey environment variable on the API service.",
            });

        if (string.IsNullOrWhiteSpace(request.Topic))
            return BadRequest(new { error = "Tell the generator what the post is about." });
        if (request.Platforms.Count == 0)
            return BadRequest(new { error = "Pick at least one platform." });

        var variantsPerPlatform = Math.Clamp(request.VariantsPerPlatform ?? 2, 1, 5);
        try
        {
            var variants = await generator.GenerateAsync(
                request.Topic.Trim(),
                string.IsNullOrWhiteSpace(request.Tone) ? "friendly and confident" : request.Tone.Trim(),
                request.Platforms.Distinct().ToList(),
                variantsPerPlatform,
                ct);
            return new { variants };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Caption generation failed.");
            return StatusCode(502, new { error = "The AI generator hit an error — try again in a moment." });
        }
    }
}
