(() => {
 const topic = document.getElementById('prediction-topic'), result = document.getElementById('prediction-result'), date = document.getElementById('prediction-date')
 if (!topic || !result || !date) return
 const entries = [...document.querySelectorAll('.prediction-entry')]
 const filter = () => {
  let count = 0
  for (const entry of entries) {
   entry.hidden = Boolean((topic.value && entry.dataset.topic !== topic.value) || (result.value && entry.dataset.result !== result.value) || (date.value && entry.dataset.date < date.value))
   if (!entry.hidden) count++
  }
  document.getElementById('prediction-count').textContent = `${count} matching prediction${count === 1 ? '' : 's'}`
 }
 for (const input of [topic,result,date]) input.addEventListener('change',filter)
})()
