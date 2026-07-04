using Microsoft.AspNetCore.Mvc;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Controllers;

[ApiController]
[Route("api/platforms")]
public class PlatformsController : ControllerBase
{
    /// <summary>Platform specs the composer uses for live character counts and warnings.</summary>
    [HttpGet]
    public IReadOnlyCollection<PlatformSpec> List() => PlatformCatalog.Specs.Values.ToList();
}

[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public object Get() => new { status = "ok", timeUtc = DateTimeOffset.UtcNow };
}
