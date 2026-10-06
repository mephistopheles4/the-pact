# Spec: slugs for page titles

Turn a page title into a URL slug: lower case, words joined by single hyphens,
no hyphen at either end. Titles are plain ASCII; other characters are out of
scope. Any character other than a letter or a digit, an apostrophe included,
breaks words, and a title with no letters or digits gives an empty slug.
