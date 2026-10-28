# Shared Vocabulary Data Attribution

The editable vocabulary data in `shared/vocabulary/levels/*.json` and the generated
`index.json` / `lookup.json` artifacts are a modified dataset distributed under
**CC BY-SA 4.0** because the production library derives from share-alike vocabulary data.

## English-Vietnamese dictionary data

Dữ liệu từ điển: Từ điển Anh–Việt thichhoc.com (thichhoc-dict),
giấy phép CC BY-SA 4.0.
https://github.com/thichhoc-org/thichhoc-dict
Nguồn gốc: WordNet 3.1 (Princeton), CMUdict (CMU), Wiktionary.
Đã chỉnh sửa dữ liệu.

The production pipeline uses thichhoc-dict as enrichment data for Vietnamese meanings
and pronunciation metadata. Automatic promotion requires CMUdict plus Wiktionary or WordNet
provenance; ambiguous/multi-pronunciation records are excluded from the bulk path.

## English frequency ranking

Automatic bulk selection is ranked with wordfreq 3.1.1 by Robyn Speer:

https://pypi.org/project/wordfreq/3.1.1/
https://github.com/rspeer/wordfreq

wordfreq combines multiple usage sources and provides the English frequency ranking used
to keep the bulk library focused on common single-word headwords instead of arbitrary
dictionary phrases or obscure named entities.

wordfreq code is Apache-2.0. Its included frequency data is redistributable under the
licensing/attribution terms documented in the upstream LICENSE.txt and NOTICE.md, including
CC BY-SA 4.0 data sources and required source acknowledgements. Credit: Robyn Speer.

## English lexical whitelist

Bulk candidates are also intersected with the English Speller Database (ESDB),
formerly SCOWL:

https://github.com/en-wl/wordlist

Pinned revision:

~~~text
1e5b7d3a72f47a71da5d28686c1dd4b397178485
~~~

The pipeline exports the American-English size-70 word list, excludes abbreviations
and special categories, and keeps lowercase alphabetic entries only. This provides a
lexical whitelist that removes proper names, acronyms, and arbitrary dictionary phrases
while wordfreq still controls usefulness/frequency ranking.

ESDB is derived from BSD-compatible sources and the combined work is distributed under
the MIT-like terms in its Copyright file.

## CEFR reference

Difficulty ordering uses the CEFR-J Vocabulary Profile as a reference:

The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono,
Tokyo University of Foreign Studies.

https://github.com/openlanguageprofiles/olp-en-cefrj

The CEFR-J repository states that the vocabulary profile may be used for research
and commercial purposes without charge when the dataset is properly cited.

## Pronunciation convention

The library standard is **General American IPA**.

The source pipeline primarily derives IPA from CMUdict. Heteronyms are not accepted
blindly: candidates with multiple trusted pronunciations are excluded from bulk promotion.
The already-reviewed Levels 001-003 remain preserved.

## Important license scope

The CC BY-SA 4.0 share-alike requirement applies to the derived vocabulary data.
It does not change the license of unrelated application source code that reads the data.
