package run.wanwan.search;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;
import org.springframework.stereotype.Component;
import run.wanwan.model.Enums.MaterialType;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Stage;
import run.wanwan.model.Visibility;

/**
 * 已发布资料卡的内存倒排索引（ADR-003）。只索引公开字段；返回的名称仍需调用方按主数据复核。
 */
@Component
public class SearchIndex {

    public static final int MAX_KEYWORD_LENGTH = 100;

    private record Doc(String name, Set<Stage> stages, MaterialType type, int priority,
                       Set<String> tokens) {
    }

    private final Map<String, Doc> docs = new HashMap<>();
    private final Map<String, Set<String>> postings = new HashMap<>();
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    /** 资料卡新增/变更时调用：可列出则（重新）入索引，否则移除。 */
    public void upsert(ResourceCard card) {
        String name = card.getMetadata().getName();
        if (!Visibility.isListed(card)) {
            remove(name);
            return;
        }
        var s = card.getSpec();
        Set<String> tokens = new HashSet<>();
        for (String field : new String[] {s.getOriginalTitle(), s.getDisplayTitle(), s.getIntro(),
            s.getSourceName(), s.getAuthor(), s.getDoi(), s.getPmid()}) {
            tokens.addAll(Tokenizer.indexTokens(field));
        }
        if (s.getTags() != null) {
            s.getTags().forEach(tag -> tokens.addAll(Tokenizer.indexTokens(tag)));
        }
        var doc = new Doc(name, s.getStages() == null ? Set.of() : Set.copyOf(s.getStages()),
            s.getMaterialType(), s.getPriority() == null ? 1000 : s.getPriority(), tokens);
        lock.writeLock().lock();
        try {
            removeUnlocked(name);
            docs.put(name, doc);
            tokens.forEach(t -> postings.computeIfAbsent(t, k -> new HashSet<>()).add(name));
        } finally {
            lock.writeLock().unlock();
        }
    }

    public void remove(String name) {
        lock.writeLock().lock();
        try {
            removeUnlocked(name);
        } finally {
            lock.writeLock().unlock();
        }
    }

    private void removeUnlocked(String name) {
        Doc old = docs.remove(name);
        if (old == null) {
            return;
        }
        for (String t : old.tokens()) {
            Set<String> set = postings.get(t);
            if (set != null) {
                set.remove(name);
                if (set.isEmpty()) {
                    postings.remove(t);
                }
            }
        }
    }

    /**
     * 所有查询词都命中才返回（AND），按人工推荐顺序、名称排序。关键词为空或过长返回空列表。
     */
    public List<String> search(String keyword, Stage stage, MaterialType type) {
        if (keyword == null || keyword.isBlank() || keyword.length() > MAX_KEYWORD_LENGTH) {
            return List.of();
        }
        Set<String> queryTokens = Tokenizer.tokenize(keyword);
        if (queryTokens.isEmpty()) {
            return List.of();
        }
        lock.readLock().lock();
        try {
            Set<String> hits = null;
            for (String t : queryTokens) {
                Set<String> p = postings.getOrDefault(t, Set.of());
                if (hits == null) {
                    hits = new HashSet<>(p);
                } else {
                    hits.retainAll(p);
                }
                if (hits.isEmpty()) {
                    return List.of();
                }
            }
            List<Doc> result = new ArrayList<>();
            for (String name : hits) {
                Doc d = docs.get(name);
                if (d != null && (stage == null || d.stages().contains(stage))
                    && (type == null || type == d.type())) {
                    result.add(d);
                }
            }
            result.sort(Comparator.comparingInt(Doc::priority).thenComparing(Doc::name));
            return result.stream().map(Doc::name).toList();
        } finally {
            lock.readLock().unlock();
        }
    }

    public int size() {
        lock.readLock().lock();
        try {
            return docs.size();
        } finally {
            lock.readLock().unlock();
        }
    }
}
