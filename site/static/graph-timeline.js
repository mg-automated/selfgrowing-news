(() => {
  const root = document.querySelector("[data-graph-timeline]")
  if (!root) return

  const container = root.querySelector(".timeline-graph-container")
  const playButton = root.querySelector(".homepage-graph-play")
  const playIcon = playButton.querySelector("[aria-hidden]")
  const playLabel = root.querySelector(".homepage-graph-play-label")
  const latestButton = root.querySelector(".homepage-graph-latest")
  const dateLabel = root.querySelector(".homepage-graph-date")
  const dateSlider = root.querySelector(".homepage-graph-date-slider")
  const speedSlider = root.querySelector(".homepage-graph-speed")
  const speedValue = root.querySelector(".homepage-graph-speed-value")
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const basePath = document.body.dataset.basepath ?? ""
  const contentIndexUrl = `${basePath}/static/contentIndex.json`.replace(/^\/\//, "/")
  let timer = null
  let currentIndex = 0
  let dates = []

  function ensureD3() {
    if (window.d3) return Promise.resolve(window.d3)

    const source = "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"
    const existing = document.querySelector(`script[src^="${source}"]`)
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", () => resolve(window.d3), { once: true })
        existing.addEventListener("error", reject, { once: true })
      })
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = source
      script.crossOrigin = "anonymous"
      script.addEventListener("load", () => resolve(window.d3), { once: true })
      script.addEventListener("error", reject, { once: true })
      document.head.appendChild(script)
    })
  }

  function pageUrl(slug) {
    return `${basePath}/${slug}`.replace(/^\/\//, "/")
  }

  function topicLabel(slug, entry) {
    return entry?.title || slug.split("/").at(-1).replaceAll("-", " ")
  }

  function buildHistory(index) {
    const dailyPattern = /^news\/daily\/(\d{4}-\d{2}-\d{2})$/
    const dailyEntries = Object.entries(index)
      .map(([slug, entry]) => ({ slug, entry, date: slug.match(dailyPattern)?.[1] }))
      .filter(({ date }) => date)
      .sort((a, b) => a.date.localeCompare(b.date))
    const nodes = new Map()
    const links = []

    for (const { slug, entry, date } of dailyEntries) {
      nodes.set(slug, {
        id: slug,
        label: entry.title || date,
        type: "daily",
        firstSeen: date,
      })

      for (const target of entry.links || []) {
        if (!target.startsWith("topics/") || !index[target]) continue
        if (!nodes.has(target)) {
          nodes.set(target, {
            id: target,
            label: topicLabel(target, index[target]),
            type: "topic",
            firstSeen: date,
          })
        }
        links.push({ id: `${slug}->${target}`, sourceId: slug, targetId: target, firstSeen: date })
      }
    }

    return {
      dates: [...new Set(dailyEntries.map(({ date }) => date))],
      nodes: [...nodes.values()],
      links,
    }
  }

  function stopPlayback() {
    if (timer !== null) window.clearInterval(timer)
    timer = null
    playButton.setAttribute("aria-pressed", "false")
    playButton.setAttribute("aria-label", "Play graph history")
    playIcon.textContent = "▶"
    playLabel.textContent = "Play"
  }

  function updateSpeedLabel() {
    const daysPerSecond = Number(speedSlider.value) / 2
    speedValue.value = daysPerSecond === 1 ? "1 day/s" : `${daysPerSecond.toFixed(1)} days/s`
  }

  function playbackDelay() {
    return 2000 / Number(speedSlider.value)
  }

  function assignNodeRadii(nodes, links) {
    const degreeById = new Map(nodes.map((node) => [node.id, 0]))
    for (const link of links) {
      degreeById.set(link.sourceId, (degreeById.get(link.sourceId) || 0) + 1)
      degreeById.set(link.targetId, (degreeById.get(link.targetId) || 0) + 1)
    }
    for (const node of nodes) node.radius = 2 + Math.sqrt(degreeById.get(node.id) || 0)
  }

  Promise.all([ensureD3(), fetch(contentIndexUrl).then((response) => {
    if (!response.ok) throw new Error(`Content index returned ${response.status}`)
    return response.json()
  })])
    .then(([d3, contentIndex]) => {
      const history = buildHistory(contentIndex)
      dates = history.dates
      if (dates.length === 0) {
        container.innerHTML = '<div class="timeline-graph-empty">The timeline will appear after the first daily briefing is archived.</div>'
        return
      }

      const width = Math.max(container.clientWidth, 320)
      const height = Math.max(container.clientHeight, 320)
      const svg = d3.select(container).append("svg").attr("viewBox", [0, 0, width, height])
      const stage = svg.append("g")
      const linkLayer = stage.append("g")
      const nodeLayer = stage.append("g")
      const nodeById = new Map(history.nodes.map((node) => [node.id, node]))
      const simulation = d3
        .forceSimulation([])
        .force("charge", d3.forceManyBody().strength(-85))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.12))
        .force("link", d3.forceLink([]).id((node) => node.id).distance(46).strength(0.28))
        .force("collision", d3.forceCollide().radius((node) => node.radius || 2).iterations(3))

      svg.call(
        d3.zoom().scaleExtent([0.35, 4]).on("zoom", (event) => stage.attr("transform", event.transform)),
      )

      function activeState(date) {
        const nodes = history.nodes.filter((node) => node.firstSeen <= date)
        const ids = new Set(nodes.map((node) => node.id))
        const links = history.links
          .filter((link) => link.firstSeen <= date && ids.has(link.sourceId) && ids.has(link.targetId))
          .map((link) => ({ ...link, source: link.sourceId, target: link.targetId }))
        return { nodes, links }
      }

      function seedNewNodes(nodes, links) {
        const active = new Set(nodes.map((node) => node.id))
        for (const node of nodes) {
          if (Number.isFinite(node.x) && Number.isFinite(node.y)) continue
          const neighbourLink = links.find((link) => link.sourceId === node.id || link.targetId === node.id)
          const neighbourId = neighbourLink && (neighbourLink.sourceId === node.id ? neighbourLink.targetId : neighbourLink.sourceId)
          const neighbour = neighbourId && active.has(neighbourId) ? nodeById.get(neighbourId) : null
          node.x = (neighbour?.x ?? width / 2) + (Math.random() - 0.5) * 24
          node.y = (neighbour?.y ?? height / 2) + (Math.random() - 0.5) * 24
        }
      }

      function updateGraph(indexValue) {
        currentIndex = Math.max(0, Math.min(indexValue, dates.length - 1))
        const date = dates[currentIndex]
        const { nodes, links } = activeState(date)
        assignNodeRadii(nodes, links)
        seedNewNodes(nodes, links)
        dateSlider.value = String(currentIndex)
        dateLabel.textContent = `${date} · ${nodes.length} nodes · ${links.length} links`

        const linkSelection = linkLayer.selectAll("line").data(links, (link) => link.id)
        linkSelection.exit().remove()
        const enteredLinks = linkSelection.enter().append("line").attr("class", "timeline-graph-link")
        if (!reducedMotion) enteredLinks.attr("opacity", 0).transition().duration(350).attr("opacity", 1)

        const nodeSelection = nodeLayer.selectAll("g").data(nodes, (node) => node.id)
        nodeSelection.exit().remove()
        const enteredNodes = nodeSelection
          .enter()
          .append("g")
          .attr("class", (node) => `timeline-graph-node is-${node.type}`)
          .attr("tabindex", 0)
          .attr("role", "link")
          .attr("aria-label", (node) => node.label)
          .on("click", (_event, node) => { window.location.href = pageUrl(node.id) })
          .on("keydown", (event, node) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              window.location.href = pageUrl(node.id)
            }
          })
          .call(
            d3.drag()
              .on("start", (event) => {
                if (!event.active) simulation.alphaTarget(0.25).restart()
                event.subject.fx = event.subject.x
                event.subject.fy = event.subject.y
              })
              .on("drag", (event) => {
                event.subject.fx = event.x
                event.subject.fy = event.y
              })
              .on("end", (event) => {
                if (!event.active) simulation.alphaTarget(0)
                event.subject.fx = null
                event.subject.fy = null
              }),
          )
        enteredNodes.append("circle")
        enteredNodes.append("text").attr("x", 8).attr("y", 3).text((node) => node.label)
        enteredNodes.append("title").text((node) => `${node.label} · first linked ${node.firstSeen}`)
        if (!reducedMotion) enteredNodes.attr("opacity", 0).transition().duration(350).attr("opacity", 1)

        const allLinks = enteredLinks.merge(linkSelection)
        const allNodes = enteredNodes.merge(nodeSelection)
        allNodes.select("circle").attr("r", (node) => node.radius)
        simulation.nodes(nodes)
        simulation.force("link").links(links)
        simulation.alpha(reducedMotion ? 0.15 : 0.45).restart()
        simulation.on("tick", () => {
          allLinks
            .attr("x1", (link) => link.source.x)
            .attr("y1", (link) => link.source.y)
            .attr("x2", (link) => link.target.x)
            .attr("y2", (link) => link.target.y)
          allNodes.attr("transform", (node) => `translate(${node.x},${node.y})`)
        })
      }

      function startPlayback() {
        if (currentIndex >= dates.length - 1) updateGraph(0)
        stopPlayback()
        playButton.setAttribute("aria-pressed", "true")
        playButton.setAttribute("aria-label", "Pause graph history")
        playIcon.textContent = "❚❚"
        playLabel.textContent = "Pause"
        timer = window.setInterval(() => {
          if (currentIndex >= dates.length - 1) {
            stopPlayback()
            return
          }
          updateGraph(currentIndex + 1)
        }, playbackDelay())
      }

      dateSlider.max = String(dates.length - 1)
      dateSlider.value = String(dates.length - 1)
      updateSpeedLabel()
      updateGraph(dates.length - 1)

      playButton.addEventListener("click", () => timer === null ? startPlayback() : stopPlayback())
      latestButton.addEventListener("click", () => {
        stopPlayback()
        updateGraph(dates.length - 1)
      })
      dateSlider.addEventListener("input", () => {
        stopPlayback()
        updateGraph(Number(dateSlider.value))
      })
      speedSlider.addEventListener("input", () => {
        const wasPlaying = timer !== null
        updateSpeedLabel()
        if (wasPlaying) startPlayback()
      })
    })
    .catch((error) => {
      console.error("[Graph timeline]", error)
      container.innerHTML = '<div class="timeline-graph-error">The graph timeline could not be loaded.</div>'
    })
})()
