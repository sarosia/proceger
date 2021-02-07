const $ = function(id, type, attributes = {}, children = []) {
  if (type === undefined) {
    return document.getElementById(id);
  }
  const elm = document.createElement(type);
  for (const [key, value] of Object.entries(attributes)) {
    elm.setAttribute(key, value);
  }
  if (typeof children === 'string') {
    elm.innerHTML = children;
  } else {
    for (const child of children) {
      elm.appendChild(child);
    }
  }
  if (id) {
    if (typeof id === 'string') {
      $(id).appendChild(elm);
    } else {
      id.appendChild(elm);
    }
  }
  return elm;
};

$$ = function (type, attributes, children) {
  return $(null, type, attributes, children);
};

window.onload = async function() {
  const res = await fetch('/task/list');
  const tasks = await res.json();
  for (const task of tasks) {
    $('tasks-tab', 'li', {}, [$$('a', {'href':''}, task.name)]);
    const content = $('tasks-content', 'li', {}, [
      $$('div', {}, [
        $$('ul', {'class': 'uk-list'}, [
          $$('li', {}, `PID: ${task.pid}`),
          $$('li', {}, `Repository: ${task.git}`),
          $$('li', {}, `Revision: ${task.revision}`),
          $$('li', {}, `Start time: ${new Date(task.startTime)}`),
        ]),
      ]),
      $$('ul', {
        'id': `task-${task.name}-logs-tab`,
        'class': 'uk-tab',
        'data-uk-tab': `{connect:'#task-${task.name}-logs'}`
      }),
      $$('ul', {
        'id': `task-${task.name}-logs`,
        'class': 'uk-switcher uk-margin',
      }),
    ]);
    for (const [filename, logs] of Object.entries(task.logs)) {
      $(`task-${task.name}-logs-tab`, 'li', {}, [
        $$('a', {'href': ''}, filename),
      ]);
      $(`task-${task.name}-logs`, 'li', {}, [
        $$('div', {'class': 'logs'}, logs.split('\n').map((line) => {
          try {
            const log = JSON.parse(line);
            return $$('p', {}, `${log.timestamp} ${log.message}`);
          } catch (e) {
            return $$('p', {}, '');
          }
        })),
      ]);
    }
  }
};
