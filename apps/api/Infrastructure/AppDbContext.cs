using Microsoft.EntityFrameworkCore;
using SocialMedia.Api.Domain;

namespace SocialMedia.Api.Infrastructure;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();
    public DbSet<ConnectedAccount> ConnectedAccounts => Set<ConnectedAccount>();
    public DbSet<MediaAsset> MediaAssets => Set<MediaAsset>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<PostTarget> PostTargets => Set<PostTarget>();
    public DbSet<PublishAttempt> PublishAttempts => Set<PublishAttempt>();
    public DbSet<OAuthState> OAuthStates => Set<OAuthState>();
    public DbSet<DataDeletionRequest> DataDeletionRequests => Set<DataDeletionRequest>();
    public DbSet<Target> Targets => Set<Target>();
    public DbSet<Prospect> Prospects => Set<Prospect>();
    public DbSet<EmailLog> EmailLogs => Set<EmailLog>();
    public DbSet<Campaign> Campaigns => Set<Campaign>();
    public DbSet<SequenceStep> SequenceSteps => Set<SequenceStep>();
    public DbSet<Enrollment> Enrollments => Set<Enrollment>();
    public DbSet<CampaignMessage> CampaignMessages => Set<CampaignMessage>();
    public DbSet<SuppressionEntry> SuppressionEntries => Set<SuppressionEntry>();
    public DbSet<Article> Articles => Set<Article>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AppUser>().HasIndex(u => u.Email).IsUnique();

        b.Entity<WorkspaceMember>().HasKey(m => new { m.WorkspaceId, m.UserId });
        b.Entity<WorkspaceMember>()
            .HasOne(m => m.Workspace).WithMany(w => w.Members).HasForeignKey(m => m.WorkspaceId);
        b.Entity<WorkspaceMember>()
            .HasOne(m => m.User).WithMany(u => u.Memberships).HasForeignKey(m => m.UserId);

        b.Entity<ConnectedAccount>()
            .HasIndex(a => new { a.WorkspaceId, a.Platform, a.ExternalId }).IsUnique();

        b.Entity<Post>().HasIndex(p => new { p.WorkspaceId, p.ScheduledAt });

        b.Entity<PostTarget>()
            .HasOne(t => t.Post).WithMany(p => p.Targets).HasForeignKey(t => t.PostId);
        b.Entity<PostTarget>()
            .HasOne(t => t.ConnectedAccount).WithMany(a => a.Targets)
            .HasForeignKey(t => t.ConnectedAccountId).OnDelete(DeleteBehavior.Restrict);

        b.Entity<PublishAttempt>()
            .HasOne(a => a.PostTarget).WithMany(t => t.Attempts).HasForeignKey(a => a.PostTargetId);

        // Not unique: the column is null until first send, and GUID tokens don't collide.
        b.Entity<Prospect>().HasIndex(p => p.UnsubscribeToken);

        b.Entity<SequenceStep>()
            .HasOne(s => s.Campaign).WithMany(c => c.Steps).HasForeignKey(s => s.CampaignId);
        b.Entity<Enrollment>()
            .HasOne(e => e.Campaign).WithMany(c => c.Enrollments).HasForeignKey(e => e.CampaignId);
        b.Entity<Enrollment>()
            .HasOne(e => e.Prospect).WithMany().HasForeignKey(e => e.ProspectId)
            .OnDelete(DeleteBehavior.Cascade);
        b.Entity<Enrollment>().HasIndex(e => new { e.CampaignId, e.ProspectId }).IsUnique();
        b.Entity<CampaignMessage>()
            .HasOne(m => m.Enrollment).WithMany().HasForeignKey(m => m.EnrollmentId);
        b.Entity<CampaignMessage>().HasIndex(m => new { m.WorkspaceId, m.Status });
        b.Entity<SuppressionEntry>().HasIndex(s => new { s.WorkspaceId, s.Email }).IsUnique();

        b.Entity<Article>().HasIndex(a => new { a.WorkspaceId, a.CreatedAt });
    }
}
