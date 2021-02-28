/**
 * e is a general purpose function to manipulate HTML DOM elements. In general
 * it will return a DOMElement as a result.
 *
 * If the first argument is a string, it will return the element matching with
 * that ID, or null if not elements is associated with that ID. The subsequce
 * arguments will be used for update its attribute and children. For example,
 *
 * e('div1') is equivalent to document.getElementById('div1').
 * e('div', {'style': 'color: red'}, 'Hello world') is equivalent to the
 * following statements:
 *
 *   const div = document.getElementById('div1');
 *   div.setAttribute('style', 'color: red');
 *   div.innerHTML = 'Hello world';
 *
 * If the param is an array, creates an HTML element based on the items in the
 * array and return the element. The array should be in the form of the
 * following:
 *
 *   element := [type, {attributes...}, children]
 *   children := [elements...]|text
 *
 * If the children is a list of array, construct the children recursively and
 * append to the current node. If the children is a string, simply set the
 * node's innerHTML.
 *
 * @return {HTMLElement}
 */
const e = function(...args) {
  const getElement = function(param) {
    return document.getElementById(param);
  };

  const setAttributes = function(elm, attributes) {
    if (typeof attributes !== 'object') {
      throw new Error(`Attributes must be an object, but got ${attributes}.`);
    }
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('on')) {
        elm.addEventListener(key.substr(2), value);
      } else {
        elm.setAttribute(key, value);
      }
    }
  };

  const updateChildren = function(elm, children) {
    if (typeof children === 'string') {
      elm.innerHTML = children;
    } else if (children instanceof Array) {
      elm.innerHTML = '';
      if (children.length > 0 && !(children[0] instanceof Array)) {
        children = [children];
      }
      for (const child of children) {
        const childElm = buildElement(child);
        elm.appendChild(childElm);
      }
    } else {
      throw new Error('Attributes must be an object');
    }
  };

  const buildElement = function(param) {
    const [type, attributes, children] = param;
    const elm = document.createElement(type);
    if (attributes !== undefined) {
      setAttributes(elm, attributes);
    }
    if (children !== undefined) {
      updateChildren(elm, children);
    }
    return elm;
  };

  let elm;
  if (typeof args[0] === 'string' || args[0] instanceof String) {
    elm = getElement(args[0]);
    if (args.length >= 2) {
      setAttributes(elm, args[1]);
    }
    if (args.length >= 3) {
      updateChildren(elm, args[2]);
    }
  } else if (args[0] instanceof Array) {
    elm = buildElement(args[0]);
  } else {
    throw new Error(`Unsupported arguments ${args}.`);
  }
  return elm;
};

export {e as default};
