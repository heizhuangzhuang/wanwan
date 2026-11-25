package run.wanwan.notice;

import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;

class FamilyEndpointTest {
    @Test
    void aPreviousAccountsQueuedRequestCannotUseTheCurrentCookie() {
        var access = mock(FamilyAccess.class, withSettings().useConstructor(
            mock(run.halo.app.extension.ExtensionClient.class),
            new CastJournalSettings(new org.springframework.mock.env.MockEnvironment()
                .withProperty("XIAOJIAOYA_CAST_ENABLED", "true")
                .withProperty("XIAOJIAOYA_CAST_CONTACT", "privacy@example.test")
                .withProperty("XIAOJIAOYA_CAST_ENCRYPTION_KEY", java.util.Base64.getEncoder().encodeToString(new byte[32]))
                .withProperty("WANWAN_WECHAT_APP_ID", "wx0000000000000000")
                .withProperty("WANWAN_WECHAT_APP_SECRET", "fixture")),
            mock(WechatNoticeClient.class),
            new org.springframework.mock.env.MockEnvironment().withProperty("XIAOJIAOYA_FAMILY_ENABLED", "true")));
        var journal = mock(CastJournalService.class);
        when(access.session("new-browser-session")).thenReturn(
            new FamilyAccess.Session("account-b", "openid-b", "web", Instant.now().plusSeconds(100)));
        when(access.session(null)).thenThrow(FamilyAccess.fail(HttpStatus.UNAUTHORIZED));

        var web = WebTestClient.bindToRouterFunction(new FamilyEndpoint(access, journal).endpoint()).build();
        web.post().uri("/brace").contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("action", "read"))
            .exchange().expectStatus().isUnauthorized().expectHeader().valueEquals("Cache-Control", "no-store");
        web.post().uri("/brace").contentType(MediaType.APPLICATION_JSON)
            .header("X-Xiaojiaoya-Session", "new-browser-session")
            .header("X-Xiaojiaoya-Account", "account-a").bodyValue(Map.of("action", "clear"))
            .exchange().expectStatus().isEqualTo(412);
        verifyNoInteractions(journal);
    }
}
