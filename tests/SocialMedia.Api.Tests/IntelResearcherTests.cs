using SocialMedia.Api.Services;

namespace SocialMedia.Api.Tests;

public class IntelResearcherTests
{
    [Fact]
    public void ExtractJson_strips_fences_and_prose()
    {
        var text = "Here is the brief:\n```json\n{\"identity\": {\"selfLabels\": [\"founder\"]}}\n```\nDone.";
        Assert.Equal("{\"identity\": {\"selfLabels\": [\"founder\"]}}", IntelResearcher.ExtractJson(text));
    }

    [Fact]
    public void ExtractJson_passes_clean_json_through()
    {
        var json = "{\"a\": 1, \"b\": {\"c\": [2, 3]}}";
        Assert.Equal(json, IntelResearcher.ExtractJson(json));
    }

    [Fact]
    public void ExtractJson_throws_when_no_object_present()
    {
        Assert.Throws<InvalidOperationException>(() => IntelResearcher.ExtractJson("no json here"));
    }
}
