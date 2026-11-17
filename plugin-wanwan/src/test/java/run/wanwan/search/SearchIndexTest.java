package run.wanwan.search;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.junit.jupiter.api.Test;
import run.halo.app.extension.Metadata;
import run.wanwan.model.Enums.LinkStatus;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.Enums.PublishState;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;

class SearchIndexTest {

    static ResourceCard card(String name, String title, String intro, PublishState state,
                             Stage stage, int priority) {
        var c = new ResourceCard();
        var m = new Metadata();
        m.setName(name);
        c.setMetadata(m);
        c.getSpec().setOriginalTitle(title);
        c.getSpec().setIntro(intro);
        c.getSpec().setState(state);
        c.getSpec().setStages(Set.of(stage));
        c.getSpec().setMaterialType(MaterialType.INSTITUTION);
        c.getSpec().setPriority(priority);
        c.getSpec().setLinkStatus(LinkStatus.OK);
        return c;
    }

    @Test
    void tokenizerProducesChineseBigramsAndLatinWords() {
        assertThat(Tokenizer.tokenize("先天性马蹄内翻足 Ponseti"))
            .contains("先天", "天性", "马蹄", "内翻", "翻足", "ponseti");
        assertThat(Tokenizer.tokenize("足")).containsExactly("足");
    }

    @Test
    void onlyPublishedCardsAreSearchable() {
        var index = new SearchIndex();
        index.upsert(card("a", "马蹄内翻足产前超声", "介绍产前超声发现", PublishState.PUBLISHED,
            Stage.JUST_FOUND, 10));
        index.upsert(card("b", "马蹄内翻足草稿", "草稿内容", PublishState.DRAFT, Stage.JUST_FOUND, 1));

        assertThat(index.search("内翻足", null, null)).containsExactly("a");
        assertThat(index.search("草稿", null, null)).isEmpty();
    }

    @Test
    void withdrawRemovesFromIndex() {
        var index = new SearchIndex();
        var c = card("a", "马蹄内翻足", "介绍", PublishState.PUBLISHED, Stage.JUST_FOUND, 10);
        index.upsert(c);
        assertThat(index.search("内翻", null, null)).containsExactly("a");

        c.getSpec().setState(PublishState.WITHDRAWN);
        index.upsert(c);
        assertThat(index.search("内翻", null, null)).isEmpty();
        assertThat(index.size()).isZero();
    }

    @Test
    void sourceRetractedIsNotListed() {
        var index = new SearchIndex();
        var c = card("a", "马蹄内翻足", "介绍", PublishState.PUBLISHED, Stage.JUST_FOUND, 10);
        c.getSpec().setLinkStatus(LinkStatus.SOURCE_RETRACTED);
        index.upsert(c);
        assertThat(index.search("内翻", null, null)).isEmpty();
    }

    @Test
    void filtersByStageAndSortsByPriority() {
        var index = new SearchIndex();
        index.upsert(card("late", "内翻足随访", "x", PublishState.PUBLISHED, Stage.LONG_TERM, 5));
        index.upsert(card("first", "内翻足入门", "x", PublishState.PUBLISHED, Stage.JUST_FOUND, 20));
        index.upsert(card("second", "内翻足问答", "x", PublishState.PUBLISHED, Stage.JUST_FOUND, 1));

        assertThat(index.search("内翻足", Stage.JUST_FOUND, null)).containsExactly("second", "first");
        assertThat(index.search("内翻足", null, null)).containsExactly("second", "late", "first");
    }

    @Test
    void rejectsBlankOrTooLongKeyword() {
        var index = new SearchIndex();
        index.upsert(card("a", "内翻足", "x", PublishState.PUBLISHED, Stage.JUST_FOUND, 1));
        assertThat(index.search("  ", null, null)).isEmpty();
        assertThat(index.search("内".repeat(101), null, null)).isEmpty();
    }
}
