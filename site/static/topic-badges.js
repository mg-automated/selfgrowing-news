(() => {
  const basepath = document.body.dataset.basepath || "";
  const badgesUrl = `${basepath}/static/topic-badges.json`;

  fetch(badgesUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`Topic badges: HTTP ${response.status}`);
      return response.json();
    })
    .then((topics) => {
      function decorate() {
        for (const link of document.querySelectorAll(".explorer a.nav-file-title[href]")) {
          if (link.dataset.topicBadges) continue;
          const pathname = new URL(link.href, location.href).pathname.replace(/\/$/, "");
          const match = /\/topics\/([^/]+)$/i.exec(pathname);
          if (!match) continue;
          const topic = topics[decodeURIComponent(match[1]).toLowerCase()];
          if (!topic) continue;

          link.dataset.topicBadges = "true";
          link.classList.add("topic-explorer-link");
          const name = document.createElement("span");
          name.className = "topic-explorer-name";
          name.textContent = link.textContent;
          link.replaceChildren(name);

          const badges = document.createElement("span");
          badges.className = "topic-explorer-badges";
          const count = document.createElement("span");
          count.className = "topic-explorer-badge";
          count.textContent = String(topic.mentions);
          count.title = `${topic.mentions} daily briefing${topic.mentions === 1 ? "" : "s"} link to this topic`;
          count.setAttribute("aria-label", count.title);
          badges.append(count);
          if (topic.outlook) {
            const outlook = document.createElement("span");
            outlook.className = "topic-explorer-badge topic-explorer-outlook";
            outlook.textContent = "✦";
            outlook.title = "Outlook available";
            outlook.setAttribute("aria-label", outlook.title);
            badges.append(outlook);
          }
          link.append(badges);
        }
      }

      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          decorate();
        });
      });
      for (const explorer of document.querySelectorAll(".explorer")) {
        observer.observe(explorer, { childList: true, subtree: true });
      }
      decorate();
    })
    .catch((error) => console.error(error));
})();
