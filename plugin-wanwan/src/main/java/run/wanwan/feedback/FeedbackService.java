package run.wanwan.feedback;

import static run.halo.app.extension.index.query.Queries.equal;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import run.halo.app.extension.ListOptions;
import run.halo.app.extension.Metadata;
import run.halo.app.extension.PageRequestImpl;
import run.halo.app.extension.ReactiveExtensionClient;
import run.wanwan.api.Dtos.Page;

@Component
@RequiredArgsConstructor
public class FeedbackService {
    public static final String STATUS_INDEX = "status";
    private static final int MAX_MESSAGE = 500;
    private static final int SUBMISSIONS_PER_MINUTE = 60;
    private static final int SUBMISSIONS_PER_CLIENT_PER_MINUTE = 10;
    private static final int MAX_TRACKED_CLIENTS = 4096;
    private final ReactiveExtensionClient client;
    private long minute = Long.MIN_VALUE;
    private int attempts;
    private final Map<String, Integer> clientAttempts = new HashMap<>();

    public Mono<Receipt> submit(Submission submission, String channel) {
        return submit(submission, channel, null);
    }

    public Mono<Receipt> submit(Submission submission, String channel, String clientKey) {
        String text = submission.message() == null ? "" : submission.message().strip();
        if (submission.requestId() == null || !submission.requestId().matches("[a-z0-9-]{20,64}")
            || submission.category() == null || text.length() < 3 || text.length() > MAX_MESSAGE) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid feedback"));
        }
        if (!takeAttempt(clientKey)) {
            return Mono.error(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS));
        }
        var row = new Feedback();
        row.setMetadata(new Metadata());
        row.getMetadata().setName("suggestion-" + submission.requestId());
        row.setCategory(submission.category());
        row.setMessage(text);
        row.setChannel(channel);
        row.setStatus(Feedback.Status.NEW);
        String name = row.getMetadata().getName();
        return client.fetch(Feedback.class, name)
            .switchIfEmpty(Mono.defer(() -> client.create(row)
                .onErrorResume(error -> client.fetch(Feedback.class, name)
                    .switchIfEmpty(Mono.error(error)))))
            .flatMap(saved -> saved.getCategory() == row.getCategory()
                && Objects.equals(saved.getMessage(), text)
                && Objects.equals(saved.getChannel(), channel)
                ? Mono.just(new Receipt(true))
                : Mono.error(new ResponseStatusException(HttpStatus.CONFLICT)));
    }

    public Mono<Page<Entry>> list(int page, Feedback.Status status) {
        int current = Math.max(1, page);
        var options = ListOptions.builder();
        if (status != null) {
            options.andQuery(equal(STATUS_INDEX, status.name()));
        }
        var sort = Sort.by(Sort.Order.desc("metadata.creationTimestamp"), Sort.Order.asc("metadata.name"));
        return client.listBy(Feedback.class, options.build(), PageRequestImpl.of(current, 20, sort))
            .map(result -> new Page<>(current, 20, result.getTotal(), result.getItems().stream()
                .map(Entry::from).toList()));
    }

    public Mono<Entry> updateStatus(String name, Feedback.Status status) {
        if (status == null || !name.matches("suggestion-[a-z0-9-]{20,64}")) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST));
        }
        return client.fetch(Feedback.class, name)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)))
            .flatMap(row -> {
                if (row.getStatus() == status) return Mono.just(row);
                row.setStatus(status);
                return client.update(row);
            })
            .map(Entry::from);
    }

    public Mono<Void> delete(String name) {
        if (name == null || !name.matches("suggestion-[a-z0-9-]{20,64}")) {
            return Mono.error(new ResponseStatusException(HttpStatus.BAD_REQUEST));
        }
        return client.fetch(Feedback.class, name)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND)))
            .flatMap(client::delete)
            .then();
    }

    private synchronized boolean takeAttempt(String clientKey) {
        long now = TimeUnit.NANOSECONDS.toMinutes(System.nanoTime());
        if (minute != now) {
            minute = now;
            attempts = 0;
            clientAttempts.clear();
        }
        if (attempts >= SUBMISSIONS_PER_MINUTE) return false;
        if (clientKey != null && !clientKey.isBlank()) {
            int used = clientAttempts.getOrDefault(clientKey, 0);
            if (used >= SUBMISSIONS_PER_CLIENT_PER_MINUTE) return false;
            if (clientAttempts.size() < MAX_TRACKED_CLIENTS || clientAttempts.containsKey(clientKey)) {
                clientAttempts.put(clientKey, used + 1);
            }
        }
        attempts++;
        return true;
    }

    public record Submission(String requestId, Feedback.Category category, String message) {}
    public record Receipt(boolean accepted) {}
    public record Entry(String name, Feedback.Category category, String message, String channel,
                        Feedback.Status status, Instant createdAt) {
        private static Entry from(Feedback row) {
            return new Entry(row.getMetadata().getName(), row.getCategory(), row.getMessage(),
                row.getChannel(), row.getStatus(), row.getMetadata().getCreationTimestamp());
        }
    }
}
