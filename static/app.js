import e from './e.js';

window.onload = async function() {
  const res = await fetch('/task/list');
  const tasks = await res.json();
  e('tasks-tab', {}, tasks.map((task) => {
    return ['li', {}, ['a', {'href': ''}, task.name]];
  }));
  e('tasks-content', {}, tasks.map((task) => ['li', {}, [
    ['div', {}, [
      ['ul', {'class': 'uk-list'}, [
        ['li', {}, `PID: ${task.pid}`],
        ['li', {}, `Repository: ${task.git}`],
        ['li', {}, `Revision: ${task.revision}`],
        ['li', {}, `Start time: ${new Date(task.startTime)}`],
      ]],
    ]],
    ['p', {
      'uk-margin': '',
    }, [
      ['button', {
        'class': 'uk-button uk-button-default',
        'onclick': () => {
          fetch(`/task/${task.name}/stop`);
        },
      }, 'Stop'],
      ['span', {}, ' '],
      ['button', {
        'class': 'uk-button uk-button-default',
        'onclick': () => {
          fetch(`/task/${task.name}/restart`);
        },
      }, 'Restart'],
    ]],
    ['ul', {
      'id': `task-${task.name}-logs-tab`,
      'class': 'uk-tab',
      'data-uk-tab': `{connect:'#task-${task.name}-logs'}`,
    },
    Object.keys(task.logs).map((filename, index, files) => {
      return ['li', {
        'class': index === files.length - 1 ? 'uk-active' : '',
      }, [
        ['a', {'href': ''}, filename],
      ]];
    }),
    ],
    ['ul', {
      'id': `task-${task.name}-logs`,
      'class': 'uk-switcher uk-margin',
    },
    Object.entries(task.logs).map(([filename, logs]) => {
      return ['li', {}, [[
        'div', {'class': 'logs'}, logs.split('\n').map((line) => {
          try {
            const log = JSON.parse(line);
            return ['p', {}, `${log.timestamp} ${log.message}`];
          } catch (e) {
            return ['p', {}, line];
          }
        }),
      ]]];
    }),
    ],
  ]]));
};
