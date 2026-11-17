package run.wanwan.api;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Mono;
import run.wanwan.model.Enums.EntryType;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.PublishState;

class PublicEndpointTest {

    @Test
    void stagesAndNotFoundAndSearchBoundsWork() {
        var queryService = mock(PublicQueryService.class);
        when(queryService.getResource("missing")).thenReturn(Mono.empty());
        when(queryService.getResource("ok")).thenReturn(
            Mono.just(Dtos.ResourceView.of(
                PublicQueryServiceTest.card("ok", PublishState.PUBLISHED, LinkStatus.OK))));

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

        client.get().uri("/search?keyword=" + "a".repeat(101))
            .exchange()
            .expectStatus().isBadRequest();
    }
}
