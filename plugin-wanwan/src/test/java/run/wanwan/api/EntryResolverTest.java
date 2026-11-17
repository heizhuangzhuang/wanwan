package run.wanwan.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import run.halo.app.extension.Metadata;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.ResourceCard;

class EntryResolverTest {

    static ResourceCard.Spec spec(EntryType type, String url, LinkStatus status) {
        var s = new ResourceCard.Spec();
        s.setEntryType(type);
        s.setUrl(url);
        s.setLinkStatus(status);
        return s;
    }

    @Test
    void webEntryRequiresVerifiedHttpUrl() {
        assertThat(EntryResolver.resolve(spec(EntryType.WEB, "https://www.who.int/x", LinkStatus.OK)).type())
            .isEqualTo(EntryType.WEB);
        assertThat(EntryResolver.resolve(
            spec(EntryType.WEB, "https://www.who.int/x", LinkStatus.UNCHECKED)).type())
            .isEqualTo(EntryType.CITATION_ONLY);
        assertThat(EntryResolver.resolve(
            spec(EntryType.WEB, "https://www.who.int/x", LinkStatus.NEEDS_RECHECK)).type())
            .isEqualTo(EntryType.CITATION_ONLY);
    }

    @Test
    void rejectsDangerousSchemes() {
        for (String bad : new String[] {"javascript:alert(1)", "data:text/html,x", "file:///etc/passwd",
            "ftp://a.com/x", "https://user:pass@a.com/", "//a.com", "", null}) {
            assertThat(EntryResolver.isSafeHttpUrl(bad)).as(String.valueOf(bad)).isFalse();
            assertThat(EntryResolver.resolve(spec(EntryType.WEB, bad, LinkStatus.OK)).type())
                .isEqualTo(EntryType.CITATION_ONLY);
        }
    }

    @Test
    void mpArticleMustBeWechatHost() {
        assertThat(EntryResolver.resolve(
            spec(EntryType.MP_ARTICLE, "https://mp.weixin.qq.com/s/abc", LinkStatus.OK)).type())
            .isEqualTo(EntryType.MP_ARTICLE);
        assertThat(EntryResolver.resolve(
            spec(EntryType.MP_ARTICLE, "https://mp.weixin.qq.com.evil.com/s/abc", LinkStatus.OK)).type())
            .isEqualTo(EntryType.CITATION_ONLY);
    }

    @Test
    void miniProgramNeedsValidAppId() {
        var s = spec(EntryType.MINIPROGRAM, null, LinkStatus.OK);
        s.setMiniProgramAppId("wx0123456789abcdef");
        s.setMiniProgramPath("pages/index/index");
        assertThat(EntryResolver.resolve(s).type()).isEqualTo(EntryType.MINIPROGRAM);
        s.setMiniProgramAppId("bad");
        assertThat(EntryResolver.resolve(s).type()).isEqualTo(EntryType.CITATION_ONLY);
    }

    @Test
    void dtoHidesUnsafeCitationUrlAndUsesDisplayTitle() {
        var card = new ResourceCard();
        var m = new Metadata();
        m.setName("r1");
        card.setMetadata(m);
        card.getSpec().setOriginalTitle("Original");
        card.getSpec().setDisplayTitle("中文辅助标题");
        card.getSpec().setUrl("javascript:alert(1)");
        card.getSpec().setEntryType(EntryType.WEB);
        card.getSpec().setLinkStatus(LinkStatus.OK);

        var view = Dtos.ResourceView.of(card);
        assertThat(view.title()).isEqualTo("中文辅助标题");
        assertThat(view.originalTitle()).isEqualTo("Original");
        assertThat(view.citationUrl()).isNull();
        assertThat(view.entry().type()).isEqualTo(EntryType.CITATION_ONLY);
    }

    @Test
    void pageSizeIsClamped() {
        assertThat(PublicQueryService.normalizeSize(0)).isEqualTo(20);
        assertThat(PublicQueryService.normalizeSize(500)).isEqualTo(50);
        assertThat(PublicQueryService.normalizePage(-3)).isEqualTo(1);
    }
}
