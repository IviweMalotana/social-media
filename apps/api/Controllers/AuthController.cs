using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Auth;
using SocialMedia.Api.Domain;
using SocialMedia.Api.Infrastructure;

namespace SocialMedia.Api.Controllers;

public record RegisterRequest(string Email, string Password, string DisplayName, string? BusinessName);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, Guid UserId, Guid WorkspaceId, string DisplayName);

[ApiController]
[Route("api/auth")]
public class AuthController(AppDbContext db, JwtTokenService jwt) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || request.Password.Length < 8)
            return BadRequest(new { error = "A valid email and a password of at least 8 characters are required." });

        if (await db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new { error = "An account with this email already exists." });

        var user = new AppUser
        {
            Email = email,
            PasswordHash = PasswordHasher.Hash(request.Password),
            DisplayName = request.DisplayName.Trim(),
        };
        var workspace = new Workspace { Name = request.BusinessName?.Trim() ?? $"{user.DisplayName}'s workspace" };
        db.Users.Add(user);
        db.Workspaces.Add(workspace);
        db.WorkspaceMembers.Add(new WorkspaceMember
        {
            UserId = user.Id,
            WorkspaceId = workspace.Id,
            Role = WorkspaceRole.Owner,
        });
        await db.SaveChangesAsync();

        return new AuthResponse(jwt.Issue(user, workspace.Id), user.Id, workspace.Id, user.DisplayName);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users
            .Include(u => u.Memberships)
            .FirstOrDefaultAsync(u => u.Email == email);

        if (user is null || !PasswordHasher.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { error = "Invalid email or password." });

        var workspaceId = user.Memberships.OrderBy(m => m.JoinedAt).First().WorkspaceId;
        return new AuthResponse(jwt.Issue(user, workspaceId), user.Id, workspaceId, user.DisplayName);
    }
}
