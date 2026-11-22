package run.wanwan.search;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/**
 * 轻量分词（ADR-003）：中日韩字符按 bigram（单字时保留单字），拉丁字母与数字按词小写。
 */
public final class Tokenizer {

    private Tokenizer() {
    }

    public static Set<String> tokenize(String text) {
        return tokenize(text, false);
    }

    /** 索引分词：保留 bigram 的同时补充 CJK 单字，确保单字搜索（如「脚」「靴」「足」）可命中。 */
    public static Set<String> indexTokens(String text) {
        return tokenize(text, true);
    }

    private static Set<String> tokenize(String text, boolean includeCjkUnigrams) {
        Set<String> tokens = new LinkedHashSet<>();
        if (text == null || text.isBlank()) {
            return tokens;
        }
        String s = text.toLowerCase(Locale.ROOT);
        StringBuilder word = new StringBuilder();
        StringBuilder cjk = new StringBuilder();
        for (int i = 0; i < s.length(); ) {
            int cp = s.codePointAt(i);
            i += Character.charCount(cp);
            if (isCjk(cp)) {
                flushWord(word, tokens);
                cjk.appendCodePoint(cp);
            } else if (Character.isLetterOrDigit(cp)) {
                flushCjk(cjk, tokens, includeCjkUnigrams);
                word.appendCodePoint(cp);
            } else {
                flushWord(word, tokens);
                flushCjk(cjk, tokens, includeCjkUnigrams);
            }
        }
        flushWord(word, tokens);
        flushCjk(cjk, tokens, includeCjkUnigrams);
        return tokens;
    }

    private static void flushWord(StringBuilder word, Set<String> tokens) {
        if (!word.isEmpty()) {
            tokens.add(word.toString());
            word.setLength(0);
        }
    }

    private static void flushCjk(StringBuilder run, Set<String> tokens, boolean includeUnigrams) {
        if (run.isEmpty()) {
            return;
        }
        int[] cps = run.codePoints().toArray();
        if (cps.length == 1) {
            tokens.add(new String(cps, 0, 1));
        } else {
            for (int i = 0; i + 1 < cps.length; i++) {
                tokens.add(new String(cps, i, 2));
            }
            if (includeUnigrams) {
                for (int cp : cps) {
                    tokens.add(Character.toString(cp));
                }
            }
        }
        run.setLength(0);
    }

    private static boolean isCjk(int cp) {
        Character.UnicodeScript script = Character.UnicodeScript.of(cp);
        return script == Character.UnicodeScript.HAN
            || script == Character.UnicodeScript.HIRAGANA
            || script == Character.UnicodeScript.KATAKANA
            || script == Character.UnicodeScript.HANGUL;
    }
}
