package run.wanwan.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import run.halo.app.core.extension.content.Post;

class DtosCoverTest {
    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"/upload/../secret.jpg", "/upload/evil.svg", "//evil.test/a.jpg",
        "http://example.test/a.jpg", "javascript:alert(1)",
        "https://user:password@example.test/a.jpg", "https://", "data:image/png;base64,invalid"})
    void rejectsUnsafeOrNonPublicCoverAddresses(String cover) {
        var post = PublicQueryServiceTest.post("public", true, Post.VisibleEnum.PUBLIC, false);
        post.getSpec().setCover(cover);
        assertThat(Dtos.PostSummary.of(post, "作者").coverUrl()).isNull();
        assertThat(Dtos.PostView.of(post, "<p>正文</p>", "作者").coverUrl()).isNull();
    }

    @Test
    void acceptsSafeHaloUploadAndHttpsCoverAddresses() {
        var post = PublicQueryServiceTest.post("public", true, Post.VisibleEnum.PUBLIC, false);
        post.getSpec().setCover("/upload/cover.jpg");
        assertThat(Dtos.PostSummary.of(post, "作者").coverUrl()).isEqualTo("/upload/cover.jpg");
        assertThat(Dtos.PostView.of(post, "<p>正文</p>", "作者").coverUrl()).isEqualTo("/upload/cover.jpg");
    }
}
