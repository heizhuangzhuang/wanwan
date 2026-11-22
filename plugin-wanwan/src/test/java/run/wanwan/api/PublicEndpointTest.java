package run.wanwan.api;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.wanwan.feedback.FeedbackService;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;
import run.wanwan.notice.NoticeService;
import run.wanwan.model.Stage;
import run.wanwan.notice.CastJournalService;

class PublicEndpointTest {

    @Test
    void stagesPostsAndNotFoundAndSearchBoundsWork() {
        var queryService = mock(PublicQueryService.class);
        when(queryService.getResource("missing")).thenReturn(Mono.empty());
        when(queryService.getResource("ok")).thenReturn(
            Mono.just(Dtos.ResourceView.of(
                PublicQueryServiceTest.card("ok", PublishState.PUBLISHED, LinkStatus.OK))));
        when(queryService.listPosts(1, 20)).thenReturn(Mono.just(new Dtos.Page<>(1, 20, 1,
            List.of(new Dtos.PostSummary("g1", "导读一", "摘要", Instant.parse("2026-11-17T00:00:00Z"), "公开署名")))));
        when(queryService.getPost("missing")).thenReturn(Mono.empty());
        when(queryService.listStagePosts(Stage.JUST_FOUND, 1, 3)).thenReturn(Mono.just(new Dtos.Page<>(1, 3, 1,
            List.of(new Dtos.PostSummary("g1", "刚发现导读", "", null, null)))));

        var client = WebTestClient.bindToRouterFunction(new PublicEndpoint(queryService, mock(NoticeService.class),
            mock(CastJournalService.class), mock(FeedbackService.class)).endpoint())
            .build();

        client.get().uri("/stages")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.length()").isEqualTo(5)
            .jsonPath("$[0].key").isEqualTo("JUST_FOUND");

        client.get().uri("/resources/missing")
            .exchange()
            .expectStatus().isNotFound();

        client.get().uri("/resources/ok")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.name").isEqualTo("ok")
            .jsonPath("$.entry.type").isEqualTo(EntryType.WEB.name());

        client.get().uri("/posts")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
            .jsonPath("$.items[0].name").isEqualTo("g1")
            .jsonPath("$.items[0].author").isEqualTo("公开署名");

        client.get().uri("/stage-posts?stage=JUST_FOUND&size=3")
            .exchange().expectStatus().isOk().expectBody().jsonPath("$.items[0].name").isEqualTo("g1");
        client.get().uri("/stage-posts?stage=UNKNOWN")
            .exchange().expectStatus().isBadRequest();

        client.get().uri("/posts/missing")
            .exchange()
            .expectStatus().isNotFound();

        client.get().uri("/search?keyword=" + "a".repeat(101))
            .exchange()
            .expectStatus().isBadRequest();
    }
    @Test
    void noticeConfigurationAndRegistrationExposeOnlyPublicFields() {
        var notices = mock(NoticeService.class);
        when(notices.configuration()).thenReturn(new NoticeService.NoticeConfig("demo-template"));
        when(notices.subscribe(new NoticeService.NoticeRequest("demo-code", "demo-template", true)))
            .thenReturn(new NoticeService.NoticeResult(true));
        var client = WebTestClient.bindToRouterFunction(new PublicEndpoint(mock(PublicQueryService.class), notices,
            mock(CastJournalService.class), mock(FeedbackService.class))
            .endpoint()).build();

        client.get().uri("/notice-config").exchange()
            .expectStatus().isOk()
            .expectHeader().valueEquals("Cache-Control", "no-store")
            .expectBody().jsonPath("$.templateId").isEqualTo("demo-template");

        client.post().uri("/notice-subscriptions").contentType(MediaType.APPLICATION_JSON)
            .bodyValue("""
                {"code":"demo-code","templateId":"demo-template","enabled":true}
                """)
            .exchange().expectStatus().isOk()
            .expectHeader().valueEquals("Cache-Control", "no-store")
            .expectBody().jsonPath("$.subscribed").isEqualTo(true)
            .jsonPath("$.code").doesNotExist();

        client.post().uri("/notice-subscriptions")
            .exchange().expectStatus().isBadRequest();
    }

}
