using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;
using SocialMedia.Api.Platforms;

namespace SocialMedia.Api.Services;

public record GeneratedVariant(string Platform, string Caption, List<string> Hashtags);

/// <summary>
/// AI caption generation via the Claude API. Configured with Anthropic:ApiKey
/// (Railway: Anthropic__ApiKey); model defaults to claude-opus-4-8 and can be
/// overridden with Anthropic:Model. Uses structured outputs so the response is
/// guaranteed-parseable JSON — no brittle text scraping.
/// </summary>
public sealed class ContentGenerator
{
    private readonly AnthropicClient? _client;
    private readonly string _model;

    public ContentGenerator(IConfiguration config)
    {
        var apiKey = config["Anthropic:ApiKey"];
        _client = string.IsNullOrEmpty(apiKey) ? null : new AnthropicClient { ApiKey = apiKey };
        _model = config["Anthropic:Model"] is { Length: > 0 } model ? model : "claude-opus-4-8";
    }

    public bool IsConfigured => _client is not null;

    public async Task<List<GeneratedVariant>> GenerateAsync(
        string topic,
        string tone,
        IReadOnlyList<Domain.Platform> platforms,
        int variantsPerPlatform,
        CancellationToken ct = default)
    {
        if (_client is null)
            throw new InvalidOperationException("Anthropic:ApiKey is not configured.");

        var platformNotes = string.Join("\n", platforms.Select(p =>
        {
            var spec = PlatformCatalog.Specs[p];
            return $"- {spec.Platform}: max {spec.MaxCaptionLength} characters." + p switch
            {
                Domain.Platform.Instagram => " Engaging first line (feed truncates early), emojis welcome, 3-8 hashtags.",
                Domain.Platform.Facebook => " Conversational, minimal hashtags (0-2), a question or CTA performs well.",
                Domain.Platform.TikTok => " Short punchy hook, native/informal voice, 3-5 hashtags.",
                Domain.Platform.Pinterest => " Searchable keyword-rich description; first line may be a destination URL if provided.",
                Domain.Platform.WhatsApp => " Direct message to an opted-in customer; personal tone, one clear CTA, no hashtags.",
                _ => "",
            };
        }));

        var response = await _client.Messages.Create(new MessageCreateParams
        {
            Model = _model,
            MaxTokens = 4096,
            Thinking = new ThinkingConfigAdaptive(),
            System = "You are an expert social media copywriter for small businesses. " +
                     "You write captions that sound human and native to each platform — never generic marketing sludge. " +
                     "Respect every platform's character limit strictly.",
            Messages =
            [
                new()
                {
                    Role = Role.User,
                    Content = $"""
                        Write {variantsPerPlatform} caption variant(s) for each platform below.

                        Topic / what we're posting about: {topic}
                        Tone: {tone}

                        Platforms and their rules:
                        {platformNotes}

                        Each variant must fit its platform's limit including hashtags. Hashtags go in
                        the hashtags array without the # symbol, not in the caption text.
                        """,
                },
            ],
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = new Dictionary<string, JsonElement>
                    {
                        ["type"] = JsonSerializer.SerializeToElement("object"),
                        ["properties"] = JsonSerializer.SerializeToElement(new
                        {
                            variants = new
                            {
                                type = "array",
                                items = new
                                {
                                    type = "object",
                                    properties = new
                                    {
                                        platform = new { type = "string" },
                                        caption = new { type = "string" },
                                        hashtags = new { type = "array", items = new { type = "string" } },
                                    },
                                    required = new[] { "platform", "caption", "hashtags" },
                                    additionalProperties = false,
                                },
                            },
                        }),
                        ["required"] = JsonSerializer.SerializeToElement(new[] { "variants" }),
                        ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
                    },
                },
            },
        }, cancellationToken: ct);

        var text = response.Content.Select(b => b.Value).OfType<TextBlock>().First().Text;
        using var doc = JsonDocument.Parse(text);

        var variants = new List<GeneratedVariant>();
        foreach (var item in doc.RootElement.GetProperty("variants").EnumerateArray())
        {
            variants.Add(new GeneratedVariant(
                item.GetProperty("platform").GetString() ?? "",
                item.GetProperty("caption").GetString() ?? "",
                [.. item.GetProperty("hashtags").EnumerateArray().Select(h => h.GetString() ?? "")]));
        }
        return variants;
    }
}
