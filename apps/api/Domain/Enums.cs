namespace SocialMedia.Api.Domain;

public enum Platform
{
    Facebook = 1,
    Instagram = 2,
    TikTok = 3,
    Pinterest = 4,
    WhatsApp = 5,
    GoogleAds = 6,
}

public enum PostStatus
{
    Draft = 0,
    Scheduled = 1,
    Publishing = 2,
    Published = 3,
    PartiallyPublished = 4,
    Failed = 5,
}

public enum TargetStatus
{
    Pending = 0,
    Scheduled = 1,
    Publishing = 2,
    Published = 3,
    Failed = 4,
    Cancelled = 5,
}

public enum WorkspaceRole
{
    Owner = 0,
    Admin = 1,
    Editor = 2,
    Viewer = 3,
}

public enum ProspectStatus
{
    New = 0,
    Contacted = 1,
    Replied = 2,
    Interested = 3,
    SampleSent = 4,
    Won = 5,
    Lost = 6,
    OptedOut = 7,
}

public enum AccountHealth
{
    Healthy = 0,
    ExpiringSoon = 1,
    Expired = 2,
    Revoked = 3,
}
