using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Infrastructure;
using SocialMedia.Api.Services;

namespace SocialMedia.Api.Controllers;

[ApiController]
[Route("api/email")]
[Authorize]
public class EmailController(EmailService email, AppDbContext db) : ControllerBase
{
    /// <summary>Which transport is live — confirm "resend" here after deploying config.</summary>
    [HttpGet("status")]
    public async Task<object> Status() => new
    {
        transport = email.Transport,
        dailyCap = email.DailyCap,
        sentLast24h = await email.SentTodayAsync(User.WorkspaceId()),
    };

    [HttpGet("logs")]
    public async Task<object> Logs()
    {
        var workspaceId = User.WorkspaceId();
        return await db.EmailLogs
            .Where(l => l.WorkspaceId == workspaceId)
            .OrderByDescending(l => l.CreatedAt)
            .Take(100)
            .Select(l => new { l.Id, l.ToAddress, l.Subject, l.Status, l.Error, l.CreatedAt })
            .ToListAsync();
    }
}
