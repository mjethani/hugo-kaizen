/* Copyright (c) 2025 Manish Jethani */

'use strict';

(function () {
  // curl -OL https://unpkg.com/lunr/lunr.js && mv -v lunr.js lunr-SHA256-$(sha256 < lunr.js).js
  let lunrHash = '9431726f05c0eae2a6e54dc197709422869f25cad44f2430d2fb7ddae80cc717';
  let lunrIntegrity = 'sha256-' + btoa(String.fromCharCode(...new Uint8Array(lunrHash.match(/.{2}/g).map(b => parseInt(b, 16)))));
  let lunrURL = `{{ "/js/lunr-SHA256-${ lunrHash }.js" | relURL }}`;

{{- with resources.Get "_templates/index.json" | resources.ExecuteAsTemplate (printf "js/index.%s.json" .Lang) $ | minify | fingerprint }}
  let indexURL = '{{ .RelPermalink }}';
{{- end }}

  // Lookup table mapping permalinks to page objects.
  let indexLookup = new Map();

  let lastQuery = '';
  let updateResultsTimeoutID = -1;

  // Encodes the given string to make it safe for HTML insertion.
  function encodeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Loads lunr.js and returns a promise that resolves when it's ready.
  function loadLunr() {
    return new Promise((resolve, reject) => {
      let script = document.createElement('script');
      script.src = lunrURL;
      script.integrity = lunrIntegrity;
      script.crossOrigin = 'anonymous';
      script.async = true;

      script.onload = () => {
        resolve();
      };

      script.onerror = reject;

      document.head.appendChild(script);
    });
  }

  // Fetches the search index and returns a promise that resolves with an array
  // of page objects.
  async function fetchIndex() {
    return await (await fetch(indexURL)).json();
  }

  // Builds a Lunr searchable index from the given raw index.
  function buildLunrIndex(index) {
    return lunr(function () {
      this.ref('permalink');

      this.field('title');
      this.field('date');
      this.field('words');
      this.field('tags');
      this.field('section');

      for (let entry of index) {
        this.add(entry);
      }
    });
  }

  // Renders the given search results as HTML.
  function renderResultsHTML(query, results, resultsElement) {
    let html = '<p>{{- i18n "results_for_query" -}}</p>';
    html = html.replace('__QUERY__', `<span class="query">${ encodeHTML(query) }</span>`);

    html += '<ul>';

    // Show only the top few results.
    for (let { ref: permalink } of results.slice(0, 5)) {
      let entry = indexLookup.get(permalink);
      html += `<li><a href="${ permalink }">${ encodeHTML(entry.title) }</a></li>`;
    }

    html += '</ul>';

    resultsElement.innerHTML = html;
  }

  // Updates the search results based on the given query.
  function updateResults(lunrIndex, query, resultsElement) {
    // Skip if the query is the same as the last query.
    if (query === lastQuery) {
      return;
    }

    lastQuery = query;

    // Cancel any existing debounce timeout.
    if (updateResultsTimeoutID !== -1) {
      clearTimeout(updateResultsTimeoutID);
    }

    updateResultsTimeoutID = setTimeout(() => {
      updateResultsTimeoutID = -1;

      if (query === '') {
        // A blank query will end up matching every page. We just assume no
        // results. This is also the initial state.
        resultsElement.innerHTML = '';
        return;
      }

      let results = lunrIndex.search(query);
      renderResultsHTML(query, results, resultsElement);
    },
    250);
  }

  async function initialize() {
    let searchFormElement = document.getElementById('search-form');
    let searchInputElement = document.getElementById('search-input');
    let searchResultsElement = document.getElementById('search-results');

    // Make the form visible and set focus to its input.
    searchFormElement.style.display = '';
    searchInputElement.focus();

    let index = null;
    let lunrIndex = null;

    try {
      [ , index ] = await Promise.all([ loadLunr(), fetchIndex() ]);

      // We need the lookup table for looking up page objects from permalinks.
      for (let entry of index) {
        indexLookup.set(entry.permalink, entry);
      }

      lunrIndex = buildLunrIndex(index);

    } catch (error) {
      searchResultsElement.innerHTML = `<p class="error">{{- i18n "search_index_load_error" -}}</p>`;

      throw error;
    }

    searchInputElement.addEventListener('input', event => {
      updateResults(lunrIndex,
                    searchInputElement.value.trim(),
                    searchResultsElement);
    });

    // Initial update.
    updateResults(lunrIndex,
                  searchInputElement.value.trim(),
                  searchResultsElement);
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
