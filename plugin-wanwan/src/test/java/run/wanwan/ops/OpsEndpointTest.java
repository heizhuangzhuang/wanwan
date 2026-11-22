package run.wanwan.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.ReactiveExtensionClient;
import run.wanwan.feedback.FeedbackService;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;
import run.wanwan.model.ResourceCard;

class OpsEndpointTest {
    private static final Instant NOW = Instant.parse("2026-11-20T04:00:00Z");

    @Test
    void expiresExactlyAtTwentyFourHoursAndPreservesRecordedOutcome() {
        var check = new MiniProgramCheck();
        check.setVersion("1.2.0");
        check.setOutcome(MiniProgramCheck.Outcome.FAIL);
        check.setCheckedAt(NOW.minus(Duration.ofHours(24)));

        var view = OpsEndpoint.view("formal", check, NOW);
        assertThat(view.state()).isEqualTo(OpsEndpoint.CheckState.STALE);
        assertThat(view.outcome()).isEqualTo(MiniProgramCheck.Outcome.FAIL);
        assertThat(view.version()).isEqualTo("1.2.0");
    }

    @Test
    void overviewAndRecordingUseIndependentChannelAndServerTime() {
        var probes = mock(OpsProbes.class);
        var ok = new OpsProbes.Probe(OpsProbes.State.OK, 200, 15L);
        when(probes.snapshot()).thenReturn(Mono.just(new OpsProbes.Snapshot(NOW, ok, ok, ok, ok)));
        var storage = mock(ReactiveExtensionClient.class);
        when(storage.fetch(MiniProgramCheck.class, "formal")).thenReturn(Mono.empty());
        when(storage.fetch(MiniProgramCheck.class, "trial")).thenReturn(Mono.empty());
        var deleted = card("deleted", PublishState.PUBLISHED, LinkStatus.OK);
        deleted.getMetadata().setDeletionTimestamp(NOW);
        when(storage.listAll(eq(ResourceCard.class), any(), any())).thenReturn(Flux.just(
            card("published", PublishState.PUBLISHED, LinkStatus.NEEDS_RECHECK),
            card("pending", PublishState.PENDING_REVIEW, LinkStatus.UNCHECKED),
            card("withdrawn", PublishState.WITHDRAWN, LinkStatus.OK),
            card("source-retracted", PublishState.PUBLISHED, LinkStatus.SOURCE_RETRACTED),
            deleted));
        Instant beforeSave = Instant.now();
        when(storage.create(any(MiniProgramCheck.class))).thenAnswer(call -> {
            var check = call.getArgument(0, MiniProgramCheck.class);
            assertThat(check.getMetadata().getName()).isEqualTo("trial");
            assertThat(check.getCheckedAt()).isAfterOrEqualTo(beforeSave);
            return Mono.just(check);
        });

        var client = WebTestClient.bindToRouterFunction(new OpsEndpoint(probes, storage, mock(FeedbackService.class))
            .endpoint()).build();
        client.get().uri("/ops-overview").exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("Cache-Control", "no-store")
            .expectBody()
            .jsonPath("$.probes.webProcess.state").isEqualTo("OK")
            .jsonPath("$.miniProgramChecks[0].state").isEqualTo("UNVERIFIED")
            .jsonPath("$.miniProgramChecks[1].channel").isEqualTo("formal")
            .jsonPath("$.contentReport.publicCards").isEqualTo(1)
            .jsonPath("$.contentReport.pendingReview").isEqualTo(1)
            .jsonPath("$.contentReport.withdrawn").isEqualTo(2)
            .jsonPath("$.contentReport.linksToCheck").isEqualTo(1);
        client.put().uri("/ops-miniprogram-checks/trial").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(new OpsEndpoint.CheckInput("1.2.0", MiniProgramCheck.Outcome.PASS))
            .exchange().expectStatus().isOk().expectBody()
            .jsonPath("$.state").isEqualTo("RECENT")
            .jsonPath("$.version").isEqualTo("1.2.0");
        client.put().uri("/ops-miniprogram-checks/develop").exchange().expectStatus().isNotFound();
    }

    private static ResourceCard card(String name, PublishState state, LinkStatus linkStatus) {
        var card = new ResourceCard();
        var metadata = new Metadata();
        metadata.setName(name);
        card.setMetadata(metadata);
        card.getSpec().setState(state);
        card.getSpec().setLinkStatus(linkStatus);
        return card;
    }
}
