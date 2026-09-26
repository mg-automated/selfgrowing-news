---
title: The Growing News Archive
description: A connected archive of daily developments in international politics, Swiss politics, and technology.
---

# The Growing News Archive

The Growing News Archive is an AI-assisted daily archive of important developments in international politics, Swiss politics, and technology. Each briefing brings together ten substantive stories from the preceding 24 hours, selected for their significance rather than their popularity. Every story includes a concise factual summary, an explanation of why it matters, and links to the reporting or primary sources behind it.

The purpose is not simply to collect daily headlines, but to create a connected record that becomes more useful over time. Stories are linked to recurring topics, previous coverage is considered to avoid unnecessary repetition, and continuing events return only when something meaningful has changed.

## Browse the archive

- [Daily news briefings](News/Daily)
- [Topics](Topics)

Use the explorer to browse the archive, search to find a specific development, or open the graph to see how daily stories connect to recurring topics.

## Explore the archive

<div class="homepage-graph-timeline" data-graph-timeline>
  <div class="homepage-graph-toolbar">
    <button class="homepage-graph-play" type="button" aria-label="Play graph history" aria-pressed="false">
      <span aria-hidden="true">▶</span>
      <span class="homepage-graph-play-label">Play</span>
    </button>
    <div class="homepage-graph-date" aria-live="polite"></div>
    <button class="homepage-graph-latest" type="button">Latest</button>
  </div>
  <div class="homepage-global-graph">
    <div class="timeline-graph-container" role="region" aria-label="Interactive graph of daily briefings and topics"></div>
  </div>
  <div class="homepage-graph-controls">
    <label class="homepage-graph-date-control">
      <span>Archive date</span>
      <input class="homepage-graph-date-slider" type="range" min="0" max="0" value="0" step="1">
    </label>
    <label class="homepage-graph-speed-control">
      <span>Speed</span>
      <input class="homepage-graph-speed" type="range" min="1" max="8" value="3" step="1">
      <output class="homepage-graph-speed-value">1.5 days/s</output>
    </label>
  </div>
</div>

<p class="homepage-graph-caption">Play the archive from its first day, scrub to a date, or select a node to open its daily briefing or topic page.</p>

<script src="/selfgrowing-news/static/graph-timeline.js" defer></script>
