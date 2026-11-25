package run.wanwan.notice;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;
import run.halo.app.core.extension.User;
import run.halo.app.extension.Extension;
import run.halo.app.extension.ExtensionClient;

class FamilyAccessTest {
    @Test
    void sameWechatOwnsBothChannelsAndPairingRequiresTheInitiatingBrowser() {
        var client = mock(ExtensionClient.class);
        var database = new ConcurrentHashMap<String, Extension>();
        when(client.fetch(eq(FamilyAccessRecord.class), anyString())).thenAnswer(
            call -> Optional.ofNullable(database.get(call.getArgument(0, Class.class).getName() + ":" + call.getArgument(1))).map(FamilyAccessRecord.class::cast));
        when(client.fetch(eq(User.class), anyString())).thenAnswer(
            call -> Optional.ofNullable(database.get(call.getArgument(0, Class.class).getName() + ":" + call.getArgument(1))).map(User.class::cast));
        doAnswer(call -> {
            Extension row = call.getArgument(0);
            database.put(row.getClass().getName() + ":" + row.getMetadata().getName(), row);
            return null;
        }).when(client).create(any());
        doAnswer(call -> {
            Extension row = call.getArgument(0);
            database.remove(row.getClass().getName() + ":" + row.getMetadata().getName());
            return null;
        }).when(client).delete(any());
        var wechat = mock(WechatNoticeClient.class);
        var env = new MockEnvironment().withProperty("XIAOJIAOYA_CAST_ENABLED", "true")
            .withProperty("XIAOJIAOYA_CAST_CONTACT", "privacy@example.test")
            .withProperty("XIAOJIAOYA_CAST_ENCRYPTION_KEY", Base64.getEncoder().encodeToString(new byte[32]))
            .withProperty("XIAOJIAOYA_FAMILY_ENABLED", "true")
            .withProperty("WANWAN_WECHAT_APP_ID", "wx0000000000000000")
            .withProperty("WANWAN_WECHAT_APP_SECRET", "test");
        when(wechat.openId(anyString(), anyString(), eq("first-code"))).thenReturn("test-openid-1");
        when(wechat.openId(anyString(), anyString(), eq("second-code"))).thenReturn("test-openid-1");
        when(wechat.openId(anyString(), anyString(), eq("another-user"))).thenReturn("test-openid-2");
        var service = new FamilyAccess(client, new CastJournalSettings(env), wechat, env);

        var mini = service.mini("first-code");
        assertEquals(mini.account(), service.mini("second-code").account());
        assertNotEquals(mini.account(), service.mini("another-user").account());
        var browser = "a".repeat(64);
        var challenge = service.createPair(browser);
        assertNull(service.exchange(challenge.code(), browser));
        service.approve(challenge.code(), service.session(mini.token()));
        assertThrows(ResponseStatusException.class, () -> service.exchange(challenge.code(), "b".repeat(64)));
        var web = service.exchange(challenge.code(), browser);
        assertEquals(mini.account(), web.account());
        assertEquals("web", service.session(web.token()).channel());
        assertThrows(ResponseStatusException.class, () -> service.exchange(challenge.code(), browser));
        service.logout(web.token());
        assertThrows(ResponseStatusException.class, () -> service.session(web.token()));
        assertEquals("mini", service.session(mini.token()).channel());

        var haloUser = (User) database.get(User.class.getName() + ":" + mini.account());
        assertNull(haloUser.getSpec().getPassword());
        haloUser.getSpec().setDisabled(true);
        assertThrows(ResponseStatusException.class, () -> service.session(mini.token()));
        assertThrows(ResponseStatusException.class, () -> service.verifyLegacy("test-openid-1"));
    }
}
