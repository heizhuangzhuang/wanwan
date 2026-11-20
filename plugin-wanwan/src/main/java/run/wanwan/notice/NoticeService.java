package run.wanwan.notice;

import static run.halo.app.extension.index.query.Queries.equal;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;
import run.halo.app.core.extension.content.Post;
import run.halo.app.extension.Extension;
import run.halo.app.extension.ExtensionClient;
import run.halo.app.extension.ExtensionOperator;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.Metadata;
import run.wanwan.model.ResourceCard;
import run.wanwan.model.Visibility;

@Component
@RequiredArgsConstructor
@Slf4j
public class NoticeService {
    public static final String PENDING_SCOPE = "pendingScope";
    static final Duration DISPATCH_WINDOW = Duration.ofHours(24);
    static final Duration GRANT_LIFETIME = Duration.ofDays(90);

    private final ExtensionClient client;
    private final NoticeSettings settings;
    private final WechatNoticeClient wechat;

    public NoticeConfig configuration() {
        return new NoticeConfig(settings.config().map(NoticeSettings.Config::template).orElse(null));
    }

    public NoticeResult subscribe(NoticeRequest request) {
        var config = settings.config().orElseThrow(
            () -> new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        if (request.enabled() == null || !config.template().equals(request.templateId())
            || request.code() == null || !request.code().matches("[A-Za-z0-9_-]{8,128}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String openId;
        try {
            openId = wechat.openId(config, request.code());
        } catch (WechatNoticeClient.InvalidCode e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        } catch (WechatNoticeClient.Unavailable e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY);
        }
        // The raw OpenID is needed only while a grant is pending.
        String name = digest("grant", config.scope(), openId);
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                saveGrant(name, config.scope(), openId, request.enabled());
                return new NoticeResult(request.enabled());
            } catch (OptimisticLockingFailureException e) {
                // Re-read the row to recover from a concurrent subscription or dispatch.
            }
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT);
    }

    private void saveGrant(String name, String scope, String openId, boolean enabled) {
        var existing = client.fetch(NoticeSubscription.class, name);
        if (!enabled && existing.isEmpty()) return;

        var grant = existing.orElseGet(NoticeSubscription::new);
        grant.setOpenId(enabled ? openId : null);
        grant.setAcceptedAt(enabled ? Instant.now() : null);
        grant.setScope(scope);
        if (existing.isPresent()) {
            client.update(grant);
        } else {
            grant.setMetadata(metadata(name));
            if (!createIfAbsent(NoticeSubscription.class, grant)) {
                throw new OptimisticLockingFailureException("Subscription was concurrently created");
            }
        }
    }

    public void observeResource(ResourceCard resource) {
        if (Visibility.isListed(resource)) {
            // A card has no first-publish timestamp. Capture the first public observation.
            observe(NoticePublication.Kind.RESOURCE, resource, Instant.now());
        }
    }

    void observeGuide(Post post) {
        if (Visibility.isPublicPost(post) && post.getSpec().getReleaseSnapshot() != null) {
            observe(NoticePublication.Kind.GUIDE, post, post.getSpec().getPublishTime());
        }
    }

    private void observe(NoticePublication.Kind kind, Extension source, Instant publishedAt) {
        var config = settings.config();
        if (config.isEmpty() || source.getMetadata() == null) return;
        var createdAt = source.getMetadata().getCreationTimestamp();
        if (createdAt == null || publishedAt == null
            || createdAt.isBefore(config.get().since()) || publishedAt.isBefore(config.get().since())) {
            return;
        }
        String name = digest("published", kind.name(), source.getMetadata().getName());
        if (client.fetch(NoticePublication.class, name).isPresent()) return;

        var event = new NoticePublication();
        event.setMetadata(metadata(name));
        event.setContentKind(kind);
        event.setContentName(source.getMetadata().getName());
        event.setScope(config.get().scope());
        event.setPublishedAt(publishedAt);
        createIfAbsent(NoticePublication.class, event);
    }

    private <E extends Extension> boolean createIfAbsent(Class<E> type, E value) {
        try {
            client.create(value);
            return true;
        } catch (RuntimeException error) {
            // Halo may report a duplicate as a ResponseStatusException. Verify it exists.
            if (client.fetch(type, value.getMetadata().getName()).isEmpty()) throw error;
            return false;
        }
    }

    void dispatch(NoticePublication event) {
        if (event.isCompleted() || ExtensionOperator.isDeleted(event)) return;
        var config = settings.config();
        if (config.isEmpty() || !config.get().scope().equals(event.getScope())) return;

        Instant publishedAt = event.getPublishedAt();
        if (publishedAt.isAfter(Instant.now())) {
            throw new DispatchPending();
        }
        var target = target(event);
        if (target.isPresent() && publishedAt.plus(DISPATCH_WINDOW).isAfter(Instant.now())) {
            deliver(config.get(), event, target.get());
        }
        event.setCompleted(true);
        client.update(event);
    }

    private void deliver(NoticeSettings.Config config, NoticePublication event, Target target) {
        var options = ListOptions.builder().andQuery(equal(PENDING_SCOPE, config.scope())).build();
        var grants = client.listAll(NoticeSubscription.class, options, Sort.by("metadata.name"));
        String token = null;
        for (var grant : grants) {
            if (ExtensionOperator.isDeleted(grant) || grant.getOpenId() == null || grant.getAcceptedAt() == null
                || !config.scope().equals(grant.getScope())
                || !grant.getAcceptedAt().plus(GRANT_LIFETIME).isAfter(Instant.now())
                || grant.getAcceptedAt().isAfter(event.getPublishedAt())) {
                continue;
            }
            if (target(event).isEmpty()) return;
            if (token == null) token = wechat.accessToken(config);

            String openId = grant.getOpenId();
            grant.clearGrant();
            try {
                client.update(grant);
            } catch (OptimisticLockingFailureException e) {
                // Another worker or a user changed the grant. Re-read it before finishing the event.
                throw new DispatchPending();
            }
            try {
                int status = wechat.send(config, token, openId, target.title(), target.page(), event.getPublishedAt());
                if (status != 0 && status != 43101) {
                    log.warn("WeChat notice dispatch failed with code {}", status);
                }
            } catch (WechatNoticeClient.Unavailable e) {
                // The outcome may be ambiguous. A consumed grant is never sent twice.
                log.warn("WeChat notice dispatch did not return a result");
            }
        }
    }

    private Optional<Target> target(NoticePublication event) {
        String name = event.getContentName();
        String key = UriUtils.encodeQueryParam(name, StandardCharsets.UTF_8);
        return switch (event.getContentKind()) {
            case RESOURCE -> client.fetch(ResourceCard.class, name)
                .filter(Visibility::isListed)
                .map(card -> card.getSpec().title())
                .filter(title -> !title.isBlank())
                .map(title -> new Target(title, "pages/detail/detail?name=" + key));
            case GUIDE -> client.fetch(Post.class, name)
                .filter(Visibility::isPublicPost)
                .filter(post -> post.getSpec().getReleaseSnapshot() != null)
                .map(post -> post.getSpec().getTitle())
                .filter(title -> !title.isBlank())
                .map(title -> new Target(title, "pages/reading/reading?kind=guide&name=" + key));
        };
    }

    private static String digest(String... values) {
        try {
            byte[] bytes = String.join("\u0000", values).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes), 0, 24);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Metadata metadata(String name) {
        var metadata = new Metadata();
        metadata.setName(name);
        return metadata;
    }

    private record Target(String title, String page) {}

    static final class DispatchPending extends RuntimeException {}

    public record NoticeRequest(String code, String templateId, Boolean enabled) {}
    public record NoticeConfig(String templateId) {}
    public record NoticeResult(boolean subscribed) {}
}
