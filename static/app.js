$ = function(id) {
  return document.getElementById(id);
};

window.onload = async function() {
  const res = await fetch('/task/list');
  const tasks = await res.json();
  for (const task of tasks) {
    const div = document.createElement('div');
    let innerHTML = task.name + ' ' + task.pid;
    for (const [, logs] of Object.entries(task.logs)) {
      innerHTML += '<div class="logs">';
      for (const line of logs.split('\n')) {
        try {
          const log = JSON.parse(line);
          console.log(log.timestamp, log.message);
          innerHTML += `<p>${log.timestamp} ${log.message}</p>`;
        } catch (e) {
          // ignore
        }
      }
      innerHTML += '</div>';
    }
    div.innerHTML = innerHTML;
    $('tasks').appendChild(div);
  }
};
