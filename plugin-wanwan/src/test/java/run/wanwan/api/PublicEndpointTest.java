package run.wanwan.api;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;

class PublicEndpointTest {

    @Test
    void stagesPostsAndNotFoundAndSearchBoundsWork() {
        var queryService = mock(PublicQueryService.class);
        when(queryService.getResource("missing")).thenReturn(Mono.empty());
        when(queryService.getResource("ok")).thenReturn(
            Mono.just(Dtos.ResourceView.of(
                PublicQueryServiceTest.card("ok", PublishState.PUBLISHED, LinkStatus.OK))));
        when(queryService.listPosts(1, 20)).thenReturn(Mono.just(new Dtos.Page<>(1, 20, 1,
            List.of(new Dtos.PostSummary("g1", "导读一", "摘要", Instant.parse("2026-11-17T00:00:00Z"))))));
        when(queryService.getPost("missing")).thenReturn(Mono.empty());

        var client = WebTestClient.bindToRouterFunction(new PublicEndpoint(queryService).endpoint())
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
            .jsonPath("$.items[0].name").isEqualTo("g1");

        client.get().uri("/posts/missing")
            .exchange()
            .expectStatus().isNotFound();

        client.get().uri("/search?keyword=" + "a".repeat(101))
            .exchange()
            .expectStatus().isBadRequest();
    }
}
