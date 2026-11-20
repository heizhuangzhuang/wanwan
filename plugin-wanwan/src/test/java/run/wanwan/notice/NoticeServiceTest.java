package run.wanwan.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;
import run.halo.app.core.extension.content.Post;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.Metadata;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;
import run.wanwan.model.ResourceCard;

class NoticeServiceTest {

    private static final String TEMPLATE = "template-for-testing";
    private static final String OPEN_ID = "example_openid";
    private static final String CODE = "example-code";
    private static final Instant NOW = Instant.now();
    private static final Instant CUTOFF = NOW.minusSeconds(3600);

    private final ExtensionClient db = mock(ExtensionClient.class);
    private final WechatNoticeClient wechat = mock(WechatNoticeClient.class);
    private final NoticeSettings settings = new NoticeSettings(new MockEnvironment()
        .withProperty("WANWAN_WECHAT_APP_ID", "wx1234567890abcdef")
        .withProperty("WANWAN_WECHAT_APP_SECRET", "test-only")
        .withProperty("WANWAN_WECHAT_NOTICE_TEMPLATE_ID", TEMPLATE)
        .withProperty("WANWAN_WECHAT_NOTICE_TITLE_FIELD", "thing1")
        .withProperty("WANWAN_WECHAT_NOTICE_TIME_FIELD", "time2")
        .withProperty("WANWAN_WECHAT_NOTICE_FROM", CUTOFF.toString()));
    private final NoticeSettings.Config config = settings.config().orElseThrow();
    private final NoticeService service = new NoticeService(db, settings, wechat);

    @Test
    void disabledAndWrongTemplateNeverCallWechat() {
        var disabled = new NoticeService(db, new NoticeSettings(new MockEnvironment()), wechat);
        assertThat(disabled.configuration().templateId()).isNull();
        assertThatThrownBy(() -> disabled.subscribe(new NoticeService.NoticeRequest(CODE, TEMPLATE, true)))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        assertThatThrownBy(() -> service.subscribe(new NoticeService.NoticeRequest(CODE, "other", true)))
            .isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(db, wechat);
    }

    @Test
    void onlyVerifiedWechatIdentityCreatesGrantAndCanCancelIt() {
        when(wechat.openId(config, CODE)).thenThrow(new WechatNoticeClient.InvalidCode()).thenReturn(OPEN_ID);
        var request = new NoticeService.NoticeRequest(CODE, TEMPLATE, true);
        assertThatThrownBy(() -> service.subscribe(request)).isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(db);

        assertThat(service.subscribe(request).subscribed()).isTrue();
        var stored = ArgumentCaptor.forClass(NoticeSubscription.class);
        verify(db).create(stored.capture());
        var grant = stored.getValue();
        assertThat(grant.getOpenId()).isEqualTo(OPEN_ID);
        assertThat(grant.getMetadata().getName()).doesNotContain(OPEN_ID);
        when(db.fetch(NoticeSubscription.class, grant.getMetadata().getName())).thenReturn(Optional.of(grant));

        assertThat(service.subscribe(new NoticeService.NoticeRequest(CODE, TEMPLATE, false)).subscribed()).isFalse();
        verify(db).update(grant);
        assertThat(grant.getOpenId()).isNull();
        assertThat(grant.getAcceptedAt()).isNull();
    }

    @Test
    void observesOnlyNewlyPublicCardAndKeepsOneReceipt() {
        service.observeResource(resource(CUTOFF.minusSeconds(1)));
        var card = resource(CUTOFF.plusSeconds(1));
        card.getSpec().setState(PublishState.DRAFT);
        service.observeResource(card);
        verifyNoInteractions(db);

        card.getSpec().setState(PublishState.PUBLISHED);
        service.observeResource(card);
        var receipts = ArgumentCaptor.forClass(NoticePublication.class);
        verify(db).create(receipts.capture());
        var event = receipts.getValue();
        assertThat(event.getContentName()).isEqualTo("new-card");
        assertThat(event.getContentKind()).isEqualTo(NoticePublication.Kind.RESOURCE);
        when(db.fetch(NoticePublication.class, event.getMetadata().getName())).thenReturn(Optional.of(event));
        service.observeResource(card);
        verify(db).create(any(NoticePublication.class));
        verifyNoInteractions(wechat);
    }

    @Test
    void guidePublishesOnlyFromAPublicReleaseAndUsesGuideRoute() {
        var guide = new Post();
        var metadata = metadata("first-guide");
        metadata.setCreationTimestamp(CUTOFF.plusSeconds(1));
        metadata.setLabels(Map.of(Post.PUBLISHED_LABEL, "true"));
        guide.setMetadata(metadata);
        guide.setSpec(new Post.PostSpec());
        guide.getSpec().setPublishTime(NOW.minusSeconds(5));
        guide.getSpec().setTitle("原创导读");
        guide.getSpec().setVisible(Post.VisibleEnum.PUBLIC);

        service.observeGuide(guide);
        verifyNoInteractions(db);
        guide.getSpec().setReleaseSnapshot("published-snapshot");
        service.observeGuide(guide);
        var receipts = ArgumentCaptor.forClass(NoticePublication.class);
        verify(db).create(receipts.capture());
        var event = receipts.getValue();

        mockAudience(grant(NOW.minusSeconds(30)));
        when(db.fetch(Post.class, "first-guide")).thenReturn(Optional.of(guide));
        when(wechat.accessToken(config)).thenReturn("fake");
        service.dispatch(event);
        verify(wechat).send(config, "fake", OPEN_ID, "原创导读",
            "pages/reading/reading?kind=guide&name=first-guide", event.getPublishedAt());
    }

    @Test
    void sendingClaimsTheGrantFirstAndReplayingDoesNotSendAgain() {
        var event = event();
        var grant = grant(NOW.minusSeconds(30));
        mockAudience(grant, grant(NOW), grant(NOW.minus(NoticeService.GRANT_LIFETIME)));
        mockLiveTarget();
        when(wechat.accessToken(config)).thenReturn("fake");
        when(wechat.send(config, "fake", OPEN_ID, "新资料", "pages/detail/detail?name=new-card",
            event.getPublishedAt())).thenAnswer(ignored -> {
                assertThat(grant.getOpenId()).isNull();
                return 0;
            });

        service.dispatch(event);
        service.dispatch(event);
        verify(wechat).send(config, "fake", OPEN_ID, "新资料", "pages/detail/detail?name=new-card",
            event.getPublishedAt());
        assertThat(event.isCompleted()).isTrue();
    }

    @Test
    void withdrawnContentKeepsThePendingGrant() {
        var event = event();
        var card = resource(CUTOFF.plusSeconds(1));
        card.getSpec().setLinkStatus(LinkStatus.SOURCE_RETRACTED);
        when(db.fetch(ResourceCard.class, "new-card")).thenReturn(Optional.of(card));
        service.dispatch(event);
        verifyNoInteractions(wechat);
        verify(db, never()).update(any(NoticeSubscription.class));
        assertThat(event.isCompleted()).isTrue();
    }

    @Test
    void staleGrantVersionCannotSend() {
        var event = event();
        var grant = grant(NOW.minusSeconds(30));
        mockAudience(grant);
        mockLiveTarget();
        when(wechat.accessToken(config)).thenReturn("fake");
        doThrow(new OptimisticLockingFailureException("already claimed")).when(db).update(grant);

        assertThatThrownBy(() -> service.dispatch(event)).isInstanceOf(NoticeService.DispatchPending.class);
        verify(wechat, never()).send(any(), any(), any(), any(), any(), any());
        assertThat(event.isCompleted()).isFalse();
    }

    @Test
    void ambiguousProviderFailureDoesNotCauseDuplicateSending() {
        var event = event();
        var grant = grant(NOW.minusSeconds(30));
        mockAudience(grant);
        mockLiveTarget();
        when(wechat.accessToken(config)).thenReturn("fake");
        when(wechat.send(config, "fake", OPEN_ID, "新资料", "pages/detail/detail?name=new-card",
            event.getPublishedAt())).thenThrow(new WechatNoticeClient.Unavailable());
        doAnswer(ignored -> { throw new OptimisticLockingFailureException("reconcile again"); })
            .doNothing().when(db).update(event);
        assertThatThrownBy(() -> service.dispatch(event)).isInstanceOf(OptimisticLockingFailureException.class);
        event.setCompleted(false); // Re-read a still pending event; its grant claim is already stored.
        service.dispatch(event);
        verify(wechat).send(config, "fake", OPEN_ID, "新资料", "pages/detail/detail?name=new-card",
            event.getPublishedAt());
    }

    @Test
    void expiryClearsTheRawIdentifier() {
        var grant = grant(NOW.minus(NoticeService.GRANT_LIFETIME).minusSeconds(1));
        when(db.fetch(NoticeSubscription.class, "grant")).thenReturn(Optional.of(grant));
        var reconciler = new NoticeSubscriptionReconciler(db);
        reconciler.reconcile(new run.halo.app.extension.controller.Reconciler.Request("grant"));
        verify(db).update(grant);
        assertThat(grant.getOpenId()).isNull();
    }

    @Test
    void titlesRespectWechatLengthWithoutBreakingUnicode() {
        assertThat(WechatNoticeClient.shortTitle("  " + "👣".repeat(21))).isEqualTo("👣".repeat(20));
    }

    private void mockAudience(NoticeSubscription... grants) {
        when(db.listAll(eq(NoticeSubscription.class), any(), any())).thenReturn(List.of(grants));
    }

    private void mockLiveTarget() {
        when(db.fetch(ResourceCard.class, "new-card")).thenReturn(Optional.of(resource(CUTOFF.plusSeconds(1))));
    }

    private NoticePublication event() {
        var event = new NoticePublication();
        event.setMetadata(metadata("event"));
        event.setContentKind(NoticePublication.Kind.RESOURCE);
        event.setContentName("new-card");
        event.setScope(config.scope());
        event.setPublishedAt(NOW.minusSeconds(10));
        return event;
    }

    private NoticeSubscription grant(Instant acceptedAt) {
        var grant = new NoticeSubscription();
        grant.setMetadata(metadata("grant"));
        grant.setScope(config.scope());
        grant.setOpenId(OPEN_ID);
        grant.setAcceptedAt(acceptedAt);
        return grant;
    }

    private static ResourceCard resource(Instant createdAt) {
        var resource = new ResourceCard();
        var metadata = metadata("new-card");
        metadata.setCreationTimestamp(createdAt);
        resource.setMetadata(metadata);
        resource.getSpec().setOriginalTitle("新资料");
        resource.getSpec().setState(PublishState.PUBLISHED);
        return resource;
    }

    private static Metadata metadata(String name) {
        var metadata = new Metadata();
        metadata.setName(name);
        return metadata;
    }
}
