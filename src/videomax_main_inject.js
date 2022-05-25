try { // scope and prevent errors from leaking out to page.
  const FULL_DEBUG        = false;
  const DEBUG_ENABLED     = FULL_DEBUG;
  const TRACE_ENABLED     = FULL_DEBUG;
  const ERR_BREAK_ENABLED = FULL_DEBUG;
  const EMBED_SCORES      = FULL_DEBUG;   // this will put add the score as an attribute for
                                          // elements across revisions, the zoomed page's html can
                                          // be diffed

  const VIDEO_MAX_DATA_ATTRIB_UNDO = 'data-videomax-saved';
  const VIDEO_MAX_ATTRIB_FIND      = 'data-videomax-target';
  const VIDEO_MAX_ATTRIB_ID        = 'zoomed-video';

  const VIDEO_NODES       = ['OBJECT', 'EMBED', 'VIDEO', 'IFRAME'];
  const IGNORE_NODES      = ['NOSCRIPT', 'SCRIPT', 'HEAD', 'HTML'];
  const ALWAYS_HIDE_NODES = ['FOOTER', 'HEADER'];

  const CSS_STYLE_HEADER_ID = 'maximizier-css-inject';

  const PREFIX_CSS_CLASS             = 'videomax-ext';
  // adding ANY new elements should be added to inject_undo
  const OVERLAP_CSS_CLASS            = `${PREFIX_CSS_CLASS}-overlap`;
  const HIDDEN_CSS_CLASS             = `${PREFIX_CSS_CLASS}-hide`;
  const MAX_CSS_CLASS                = `${PREFIX_CSS_CLASS}-max`;
  const PLAYBACK_CNTLS_CSS_CLASS     = `${PREFIX_CSS_CLASS}-playback-controls`;
  const PLAYBACK_VIDEO_MATCHED_CLASS = `${PREFIX_CSS_CLASS}-video-matched`;
  const EMBEDED_SCORES               = `${PREFIX_CSS_CLASS}-scores`;

  // eslint-disable-next-line no-unused-vars
  const ALL_CLASSNAMES = [OVERLAP_CSS_CLASS,
                          HIDDEN_CSS_CLASS,
                          MAX_CSS_CLASS,
                          PLAYBACK_CNTLS_CSS_CLASS,
                          PLAYBACK_VIDEO_MATCHED_CLASS,
                          EMBEDED_SCORES];

  const SPEED_CONTROLS     = `${PREFIX_CSS_CLASS}-speed-control`;
  const SCALESTRING_WIDTH  = '100%'; // "calc(100vw)";
  const SCALESTRING_HEIGHT = '100%'; // "calc(100vh)";
  const SCALESTRING        = '100%';

  const logerr = (...args) => {
    if (DEBUG_ENABLED === false) {
      return;
    }
    const inIFrame = (window !== window.parent) ? 'iframe' : '';
    // eslint-disable-next-line no-console
    console.trace(`%c VideoMax Inject ${inIFrame} ERROR`,
      'color: white; font-weight: bold; background-color: red', ...args);
    if (ERR_BREAK_ENABLED) {
      // eslint-disable-next-line no-debugger
      debugger;
    }
  };

  const trace = (...args) => {
    if (TRACE_ENABLED) {
      const inIFrame = (window !== window.parent) ? 'iframe' : 'main';
      // blue color , no break
      // eslint-disable-next-line no-console
      console.log(`%c VideoMax Inject ${inIFrame}`,
        'color: white; font-weight: bold; background-color: blue', ...args);
    }
  };


  // const videomaxGlobals = window._VideoMaxExt ? window._VideoMaxExt : {
  const videomaxGlobals = {
    elemMatcher:      null,
    foundOverlapping: false,
    /** @var {HTMLElement || Node} * */
    matchedVideo: null,

    injectedCss: false,
    cssToInject: '',

    findVideoRetry: null,

    hideEverythingTimer: null,

    isMaximized: false,

    onlyspeedadjust: false,
  };


  /**
   *
   * @param id {string}
   * @return {HTMLElement}
   */
  const $              = (id) => document.getElementById(id);
  const documentLoaded = () => ['complete', 'interactive'].includes(document.readyState);
  const isInIFrame     = () => window !== window.parent;

  /**
   *
   * @param matchstr {string}
   * @param arr {string[]}
   * @returns {boolean}
   */
  const isSubstrOfArray = (matchstr, arr) => {
    for (const str of arr) {
      if (str.indexOf(matchstr) >= 0) {
        return true;
      }
    }
    return false;
  };


  /**
   * Node does not have getAttributes or classList. Elements do
   * @param nodeOrElem {Node || HTMLElement}
   * @return {boolean}
   */
  const isElem = (nodeOrElem) => (nodeOrElem instanceof HTMLElement);
  // or is it (nodeOrElem.nodeType === Node.ELEMENT_NODE)?

  /**
   *
   * @param elem {Node || HTMLElement}
   * @param attr {string}
   * return {string}
   */
  const safeGetAttribute = (elem, attr) => {
    try {
      return elem?.getAttribute(attr) || '';
    } catch (err) {
      return '';
    }
  };

  /**
   *
   * @param elem {Node || HTMLElement}
   * @param attr {string}
   * @param value {string}
   */
  const safeSetAttribute = (elem, attr, value) => {
    try {
      if (elem && elem.setAttribute) {
        elem.setAttribute(attr, value);
      }
    } catch (err) {
      logerr(`error setting attribute ${attr}`, elem, err);
    }
  };


  /// / finding video logic. this code is a bit of a mess.
  /**
   *
   * @param doc {Document}
   * @return {boolean}
   */
  function findLargestVideoNew(doc) {
    try {
      // try top level doc
      {
        const allvideos = document.querySelectorAll('video');
        for (const eachvido of allvideos) {
          videomaxGlobals.elementMatcher.checkIfBest(eachvido);
        }
      }
      // now go into frames
      for (const frame of doc.querySelectorAll('iframe')) {
        try {
          // frame.src available?
          const framesrc = (frame?.src || '').toLowerCase();

          // if (isSubstrOfArray(framesrc, IGNORE_FRAMES_URLS)) {
          //   trace(`Iframe src='${framesrc}' skipping`);
          //   continue;
          // }

          videomaxGlobals.elementMatcher.checkIfBest(frame);

          const allvideos = frame?.contentWindow?.document.querySelectorAll('video');
          for (const eachvido of allvideos) {
            videomaxGlobals.elementMatcher.checkIfBest(eachvido);
          }
        } catch (err) {
          if (err.toString()
                .toLowerCase()
                .indexOf('blocked a frame') !== -1) {
            trace(`iframe security blocked cross domain - expected`);
          } else {
            trace(err);
          }
        }
      }

      return (videomaxGlobals.elementMatcher.getBestMatchCount() > 0);
    } catch (err) {
      trace(err);
      return false;
    }
  }

  // returns true if a new video match was found.
  function checkVidsInDoc(doc) {
    if (!doc) {
      return false;
    }
    let matchedNew = false;
    for (const tagname of VIDEO_NODES.reverse()) {
      try {
        const elemSearch = [...doc.getElementsByTagName(tagname)];
        if (elemSearch) {
          for (const eachElem of elemSearch) { // .reverse()
            matchedNew |= videomaxGlobals.elementMatcher.checkIfBest(eachElem);
          }
        }
      } catch (err) {
        logerr(err);
      }
    }
    return matchedNew;
  }

  function getElemsDocumentView(node) {
    // this can probably be simplified
    if (node.ownerDocument !== null && node.ownerDocument !== document &&
        node.ownerDocument.defaultView !== null) {
      return node.ownerDocument.defaultView;
    }
    return document.defaultView;
  }

  /**
   *
   * @param node
   * @returns {CSSStyleDeclaration}
   */
  function getElemComputedStyle(node) {
    const view = getElemsDocumentView(node);
    return view.getComputedStyle(node, null);
  }

  function safeParseInt(str) {
    const result = parseInt(str, 10);
    return Number.isNaN(result) ? 0 : result;
  }

  // function touchDocBodyToTriggerUpdate() {
  //   document.body.width = '99%';
  //   setTimeout(function() {
  //     document.body.width = '100%';
  //   }, 1);
  // }

  function forceRefresh(optionalElem) {
    // we now need to force the flash to reload by resizing... easy thing is to
    // adjust the body
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('visabilitychange'));
      if (optionalElem) {
        optionalElem?.dispatchEvent(new Event('visabilitychange'));
      } else {
        // touchDocBodyToTriggerUpdate();
      }
    }, 50);
  }

  /**
   * hiding elements in dom that aren't in tree for this element.
   * @param videoElem {Node}
   */
  function hideDomNotInTree(videoElem) {
    if (!videoElem) {
      return;
    }
    trace('hideDomNotInTree');
    let elemUp = videoElem;

    // let compstyle = getElemComputedStyle(videoElem); // used to resize divs
    let boundingclientrect = getBoundingClientRectWhole(videoElem);
    if (shouldUseParentDivForDockedCheckYoutube(videoElem)) {
      boundingclientrect = getBoundingClientRectWhole(videoElem.parentNode);
    }

    // todo: fix loop
    let saftyLoops = 1000;
    while (elemUp?.parentNode && saftyLoops--) {
      try {
        if (elemUp.nodeName.toUpperCase() !== 'SCRIPT') {
          addMaximizeClassToElem(elemUp);
        }
        hideSiblings(elemUp, boundingclientrect);
      } catch (ex) {
        logerr('hideDomNotInTree exception', ex);
      }
      elemUp = elemUp.parentNode;
    }
    if (DEBUG_ENABLED && saftyLoops === 0) {
      logerr('!!! hideDomNotInTree while loop ran too long');
    }
  }

  function findLargestVideoOld(doc, iframeTree, level = 0) {
    if (iframeTree.length > 8) {
      trace(`hit max iframe depth, returning ${iframeTree.length}`);
      return false;
    }
    if (typeof (doc?.getElementsByTagName) !== 'function') {
      trace('getElementsByTagName is not function for sub doc, bailing', doc);
      return false;
    }
    trace(`findLargestVideoOld Depth: ${level} length: ${iframeTree.length}`);

    checkVidsInDoc(doc);

    try {
      const iframes     = [...doc.getElementsByTagName('iframe')];
      let foundnewmatch = false;
      for (const eachframe of iframes) {
        try {
          foundnewmatch = checkVidsInDoc(eachframe.contentDocument);
          if (foundnewmatch) {
            trace('found a good video match in an iframe, stopping search');
            iframeTree.push(eachframe);
            videomaxGlobals.elementMatcher.setNestedFrameTree(iframeTree);
            // we found a good match, just return?
            // trace("returning from findLargestVideoOld level:" +
            // iframeTree.length);
          } else {
            /// / recursive nesting!!!
            // many sites (e.g. bing video search) buries frames inside of
            // frames
            trace('found nested iframes, going deeper');
            const deeper_iframe = arrayClone(iframeTree);
            deeper_iframe.push(eachframe);
            if (findLargestVideoOld(foundnewmatch, deeper_iframe, level + 1)) {
              trace(
                `  returning from findLargestVideoOld Depth: ${level} length: ${iframeTree.length}`);
              return true;
            }
          }
        } catch (ex) {
          // common exception because iframes can be protected if
          // they cross domains
          trace('security exception expected: ', ex);
        }

        if (!foundnewmatch) {
          try {
            foundnewmatch = videomaxGlobals.elementMatcher.checkIfBest(eachframe);
            if (foundnewmatch) {
              trace(`  Found iframe correct ratio. cannot go deeper because of XSS. 
                               Depth: ${level}
                               Length: ${iframeTree.length + 1}
                               frame`, eachframe);
              iframeTree.push(eachframe);
              videomaxGlobals.elementMatcher.setNestedFrameTree(iframeTree);
              return true; // new
            }
            // }
          } catch (ex) {
            trace('findLargestVideoOld exception in loop', ex);
          }
        }
      }
    } catch (ex) {
      // probably a security exception for trying to access frames.
      logerr('findLargestVideoOld. probably security issue', ex);
    }
    trace(`returning from findLargestVideoOld Depth: ${iframeTree.length}`);
    return false;
  }

  /**
   *
   * @param node {Node || HTMLElement}
   * @return {Node}
   * @constructor
   */
  function FixUpAttribs(node) {
    trace(`FixUpAttribs for elem type ${node.nodeName}`, node);

    // this may not be an Element, but we still want to walk children below
    if (isElem(node)) {
      // set the data-videomax-id = "zoomed" so undo can find it.
      safeSetAttribute(node, `${VIDEO_MAX_ATTRIB_FIND}`, VIDEO_MAX_ATTRIB_ID);
      const attribs = node.attributes;

      trace(`attrib count = ${attribs.length}`);
      for (const eachattrib of attribs) {
        try {
          const { name } = eachattrib;
          const orgValue = eachattrib.value;
          let newValue   = '';

          trace(`FixUpAttribs found attrib '${name}': '${orgValue}'`);
          switch (name.toLowerCase()) {
            case 'width':
              newValue = SCALESTRING_WIDTH; // 'calc(100vw)' works too?
              break;

            case 'height':
              newValue = SCALESTRING_HEIGHT; // 'calc(100vh)' works too?
              break;

            case 'data-width':
              newValue = 'calc(100vw)';
              break;

            case 'data-height':
              newValue = 'calc(100vh)';
              break;

            case 'style':
              newValue = `${orgValue};`; // remove at end. needed for parsing
              newValue = newValue.replace(/width[\s]*:[\s]*[^;&]+/i, `width: ${SCALESTRING_WIDTH}`);
              newValue = newValue.replace(/height[\s]*:[\s]*[^;&]+/i,
                `height: ${SCALESTRING_HEIGHT}`);
              newValue = newValue.substring(0, newValue.length - 1); // removing
              // trailing
              // ; we
              // added
              // above
              break;

            case 'scale':
              newValue = 'showAll';
              break;

            // case 'autoplay':
            //   if (orgValue === '0') {
            //     newValue = '1';
            //   } else {
            //     newValue = 'true';
            //   }
            //   break;

            // default:
            case 'flashlets':
            case 'data':
              newValue = grepFlashlets(orgValue);
              break;

            case 'controls':
              newValue = '1';
              break;

            case 'disablepictureinpicture':
              newValue = '0';
              break;

            default:
              break;
          }

          // replace only if set and not different
          if (newValue !== '' && newValue !== orgValue) {
            trace(`FixUpAttribs changing attribute: '${name}'
            old: '${orgValue}'
            new: '${newValue}'`, node);
            saveAttribute(node, name);
            safeSetAttribute(node, name, newValue);
          }
        } catch (ex) {
          logerr('exception in looping over properties: ', ex);
        }
      }
    }

    {
      // collect all changes here, then apply in a single writing loop. more
      // efficient for dom update
      const newParams = {};
      for (const eachnode of node.childNodes) {
        try {
          if (eachnode.nodeName.toUpperCase() !== 'PARAM') {
            continue;
          }
          if (!isElem(eachnode)) {  // 22May2022 fixed risky
            continue;
          }
          const attrName  = safeGetAttribute(eachnode, 'name');
          const attrValue = safeGetAttribute(eachnode, 'value');

          trace(`  FixUpAttribs found param '${attrName}': '${attrValue}'`);
          if (['FLASHLETS', 'DATA'].includes(attrName.toUpperCase())) {
            newParams[attrName] = grepFlashlets(attrValue);
          } else {
            // we might override below.
            newParams[attrName] = attrValue;
          }
        } catch (ex) {
          logerr('ERROR reading flash params ex', ex);
        }
      }

      // define all nodes
      newParams.bgcolor  = '#000000';
      newParams.scale    = 'showAll';
      newParams.menu     = 'true';
      newParams.quality  = 'high';
      newParams.width    = SCALESTRING_WIDTH;
      newParams.height   = SCALESTRING_HEIGHT;
      newParams.quality  = 'high';
      newParams.autoplay = 'true';

      // edit in place
      for (const eachnode of node.childNodes) {
        if (eachnode.nodeName.toUpperCase() !== 'PARAM') {
          continue;
        }
        const name     = safeGetAttribute(eachnode, 'name');
        const orgValue = safeGetAttribute(eachnode, 'value');

        if (Object.prototype.hasOwnProperty.call(newParams, name)) { // is this one we care about?
          trace(`FixUpAttribs changing child param '${name}'
            old: '${orgValue}'
            new: '${newParams[name]}'`);

          saveAttribute(eachnode, name);
          safeSetAttribute(eachnode, name, newParams[name]);
        }
      }
    }
    forceRefresh(node);
    return node;
  }

  function grepFlashlets(flashletsval) {
    let result = flashletsval;
    if (result !== '' && result?.match(/[=%]/i) !== null) {
      const rejoinedResult = [];
      const params         = parseParams(flashletsval);
      if (params) {
        for (const key of params) {
          if (Object.prototype.hasOwnProperty.call(params, key)) {
            switch (key.toLocaleLowerCase()) {
              case 'width':
              case 'vwidth':
              case 'playerwidth':
              case 'height':
              case 'vheight':
              case 'playerheight':
                params[key] = SCALESTRING;
                break;

              case 'scale':
                params[key] = 'showAll';
                break;

              case 'autoplay':
                if (params[key] === '0') {
                  params[key] = '1';
                } else {
                  params[key] = 'true';
                }
                break;

              case 'flashlets':
              case 'data': {
                const value = params[key];
                if (value?.match(/[=%]/i) !== null) {
                  params[key] = grepFlashlets(value);
                }
              }
                break;
              default:
                break;
            }

            rejoinedResult.push(`${key}=${encodeURIComponent(params[key])}`);
          }
        }

        result = rejoinedResult.join('&');
        if (flashletsval.search(/\?/i) === 0) { // startswith
          result = `?${result}`;
        }
      }
      trace(`Replaced urls params:\n\tBefore:\t${flashletsval}\r\n\tAfter\t${result}`);
    }
    return result;
  }

  function parseParams(urlformat) {
    const pl     = /\+/g; // Regex for replacing addition symbol with a space
    const search = /([^&=]+)=?([^&]*)/g;
    const decode = (s) => decodeURIComponent(s.replace(pl, ' '));
    const query  = urlformat;

    const urlParamsResult = {};
    let match             = search.exec(query);
    while (match) {
      urlParamsResult[decode(match[1])] = decode(match[2]);
      match                             = search.exec(query);
    }

    return urlParamsResult;
  }

  /**
   * Returns true if any css classname starts with our prefix.
   * @param node {Node || HTMLElement}
   * @return {boolean}
   */
  function containsAnyVideoMaxClass(node) {
    if (!isElem(node)) {
      return false;
    }
    const className = node?.className || '';
    return (className?.indexOf(PREFIX_CSS_CLASS) !== -1);
  }

  /**
   * Copy over and attribute value so it can be restored by undo
   * @param node {Node || HTMLElement}
   * @param attributeName {string}
   * @return {boolean} True if attribute saved
   */
  function saveAttribute(node, attributeName) {
    if (!isElem(node)) {
      return false;
    }
    const attributeNameLower = attributeName.toLowerCase();
    const orgValue           = safeGetAttribute(node, attributeNameLower) || '';
    if (!orgValue.length) {
      // nothing to save
      trace(`saveAttribute '${attributeNameLower}' empty, nothing to save`, node);
      return false;
    }
    const startingdata = safeGetAttribute(node, VIDEO_MAX_DATA_ATTRIB_UNDO);
    const jsondata     = JSON.parse(startingdata || '{}');
    if (Object.keys(jsondata)
      .includes(attributeNameLower)) {
      // already been saved bail
      trace(`saveAttribute '${attributeNameLower}' already saved, not overwriting `, node,
        jsondata);
      return true;
    }

    // ok merge in and save
    jsondata[attributeNameLower] = orgValue;
    safeSetAttribute(node, VIDEO_MAX_DATA_ATTRIB_UNDO, JSON.stringify(jsondata));
    trace(`saveAttribute '${attributeNameLower}' old value ${orgValue}`, node);
    return true;
  }

  /**
   *
   * @param node {Node || HTMLElement}
   */
  function addMaximizeClassToElem(node) {
    try {
      if (!isElem(node)) {
        return;
      }
      if (!containsAnyVideoMaxClass(node)) {
        trace(`Applying MAX_CSS_CLASS to ${node.nodeName} `, node);
        // hack. This crazy thing happens on some sites (dailymotion) where our
        // resizing the video triggers scripts to run that muck with the
        // element style, so we're going to save and restore that style so the
        // undo works.
        saveAttribute(node, 'style');
        node?.classList.add(MAX_CSS_CLASS);

        // some sites muck with the style
        safeSetAttribute(node, 'style', '');
      }
    } catch (ex) {
      logerr('EXCEPTION ajustElem exception: ', ex);
    }
  }

  /**
   *
   * @param elemIn { Node || HTMLElement }
   * @param boundingclientrect {{top: number, left: number, bottom: number,
   *     width: number, right: number, height: number}}
   */
  function hideSiblings(elemIn, boundingclientrect) {
    if (!elemIn) {
      trace('hideSiblings() elemIn is null');
      return;
    }
    // trace("hideSiblings for class '" + elemIn.className + "'
    // rect="+JSON.stringify(boundingclientrect));
    const elemParent = elemIn.parentNode;
    if (!elemParent) {
      return;
    }
    // if (elemParent.nodeName === 'HEAD') {
    //   trace('hideSiblings() parent is HEAD, stopping');
    //   // hit the top
    //   return;
    // }

    // could also use node.contains(elemIn) where node is the matched video?
    const parentIsVideo     = elemIn.nodeName === 'VIDEO' || elemParent.nodeName === 'VIDEO';
    const parentIsMaximized = elemIn.classList?.contains(MAX_CSS_CLASS) ||
                              elemIn.classList?.contains(PLAYBACK_CNTLS_CSS_CLASS) ||
                              elemParent.classList?.contains(MAX_CSS_CLASS) ||
                              elemParent.classList?.contains(PLAYBACK_CNTLS_CSS_CLASS);

    trace('hideSiblings');
    const sibs = getSiblings(elemParent);
    for (const each_sib of sibs.reverse()) {
      // if the element is inside the video's rect, then they are probably
      // controls. don't touch them. we are looking for elements that overlap.
      if (each_sib.isEqualNode(elemIn) || IGNORE_NODES.includes(each_sib.nodeName.toUpperCase())) {
        continue;
      }
      if (!isElem(each_sib)) {
        continue;
      }
      if (containsAnyVideoMaxClass(each_sib)) {
        continue;
      }

      const eachBoundingRect = getBoundingClientRectWhole(each_sib);
      trace('checking siblings\n', each_sib, eachBoundingRect);

      // todo: check z-order?

      // We're trying to NOT hide the controls the video is using.
      // everyone does it slightly different, so theres
      const bounded       = isBoundedRect(boundingclientrect, eachBoundingRect);
      const bottomDocked  = isBottomDocked(boundingclientrect, eachBoundingRect);
      const hasSliderRole = hasSliderRoleChild(each_sib);

      let handled = false;
      if (isSpecialCaseAlwaysHide(each_sib)) { // last ditch special case check
        trace('special case item always hide', each_sib);
        each_sib?.classList?.add(HIDDEN_CSS_CLASS);    // may be Node
        handled = true;
      }

      if (!(bounded || bottomDocked || hasSliderRole || parentIsVideo || parentIsMaximized)) {
        // each_elem.style.setProperty("display", "none", "important");
        trace(`  Add HIDDEN_CSS_CLASS overlapping elem ${each_sib.nodeName}`, each_sib);
        each_sib?.classList?.add(HIDDEN_CSS_CLASS); // may be Node
        handled = true;
      }

      if (!handled) {
        videomaxGlobals.foundOverlapping = true;
        trace(`Found overlapping elem ${each_sib.nodeName}`, each_sib);

        const isLikelyControls = hasSliderRole || bottomDocked ||
                                 (parentIsVideo && parentIsMaximized);

        if (!isLikelyControls) {
          trace(`  Add OVERLAP_CSS_CLASS to children ${each_sib.nodeName} `, each_sib);
          walkAllChildren(each_sib, (each_child_elem) => {
            const eachChildBoundingRect = getBoundingClientRectWhole(each_child_elem);
            if (isBoundedRect(boundingclientrect, eachChildBoundingRect) ||
                isBottomDocked(boundingclientrect, eachChildBoundingRect) ||
                hasSliderRoleChild(each_child_elem)) {
              if (!containsAnyVideoMaxClass(each_child_elem)) { // not already something else
                each_child_elem.classList.add(OVERLAP_CSS_CLASS);
                handled = true;
              }
            }
          });
        }

        if (!handled && isLikelyControls) {
          trace(`  Add PLAYBACK_CNTLS_CSS_CLASS ${each_sib.nodeName} `, each_sib);
          // we're going to assume it contains the playback controls and are
          // going to max with it.
          each_sib?.classList?.add(PLAYBACK_CNTLS_CSS_CLASS);
          // todo: we don't undo this modification yet.
          // each_sib.setAttribute ? each_sib.setAttribute('width',
          // 'calc(100vw)') : '';
        } else {
          trace(`  Add HIDDEN_CSS_CLASS overlapping elem ${each_sib.nodeName}`, each_sib);
          each_sib?.classList?.add(HIDDEN_CSS_CLASS);
          handled = true;
        }
      }
    }
  }

  /**
   *
   * @param elem {Node}
   * @param actionFn {function}
   */
  function walkAllChildren(elem, actionFn) {
    const active_elems = getChildren(elem, null);
    actionFn(elem); // call the parent element
    let safty = 5000;

    while (active_elems.length > 0 && safty--) {
      const next_elem = active_elems.pop();
      active_elems.concat(getChildren(next_elem, null));
      actionFn(elem);
    }
    if (DEBUG_ENABLED && safty === 0) {
      logerr('!!! hideDomNotInTree while loop ran too long');
    }
  }

  /**
   *
   * @param node {Node}
   * @param skipMe
   * @return {*[]}
   */
  function getChildren(node, skipMe) {
    const r         = [];
    let currentNode = node;
    for (let sanityMax = 0; sanityMax < 5000; sanityMax++) {
      if (!currentNode) {
        return r;
      }
      if (currentNode?.nodeType === 1 && !currentNode.isEqualNode(skipMe)) {
        r.push(currentNode);
      }
      currentNode = currentNode.nextSibling;
    }
    logerr('Hit max children in getChildren, stopping');
    return r;
  }

  /**
   *
   * @param node {Node}
   * @return {Node[]}
   */
  function getSiblings(node) {
    if (!node?.parentNode?.firstChild) return [];
    return getChildren(node.parentNode.firstChild, node);
  }

  /**
   * @constructor
   * @param debugname {string} handy for debugging.
   * @param delay {number}
   * @param maxretries {number}
   */
  function RetryTimeoutClass(debugname = '', delay = 250, maxretries = 8) {
    this.timerid = 0;
    this.delay   = delay; // + (Math.round((0.5 - Math.random()) * delay) / 10); //  +/-

    this.maxretries = maxretries;
    this.retrycount = 0;
    this.debugname  = debugname;
    this.func       = () => {};

    // func() returning true means done
    /**
     * @param func {() => boolean}
     */
    this.startTimer = (func) => {
      this.func = func;
      this.retryFunc.bind(this);
      this.retryFunc();
    };

    this.retryFunc = () => {
      trace(
        `RetryTimeoutClass.retryFunc ${this.debugname} retry: ${this.retrycount}/${this.maxretries}`);
      this.cleartimeout();
      const result = this.func();

      if (!result) {
        // returns true if we're done
        this.retrycount++;
        if (this.retrycount < this.maxretries) {
          this.timerid = setTimeout(this.retryFunc, this.delay);
        }
      } else {
        trace(`RetryTimeoutClass.retryFunc ${this.debugname}  function returned true. stopping`);
      }

      return result;
    };

    this.cleartimeout = () => {
      let timerid             = 0;
      [this.timerid, timerid] = [timerid, this.timerid];  // swap
      if (timerid) {
        clearTimeout(timerid);
      }
    };
  }

  function hideCSS(id) {
    // try {
    if (id) {
      const elem = $(id);
      if (elem) {
        saveAttribute(elem, 'media');
        elem.setAttribute('media', '_all');
      }
    }
  }

  function hasInjectedAlready() {
    return videomaxGlobals.isMaximized;
  }

  function arrayClone(arr) {
    return arr.slice(0);
  }

  /**
   * Returns whole numbers for bounding box instead of floats.
   * @param rectC {DOMRect}
   * @return {{top: number, left: number, bottom: number, width: number, right:
   *     number, height: number}}
   */
  function wholeClientRect(rectC) {
    return {
      top:    Math.round(rectC.top),
      left:   Math.round(rectC.left),
      bottom: Math.round(rectC.bottom),
      right:  Math.round(rectC.right),
      width:  Math.round(rectC.width),
      height: Math.round(rectC.height),
    };
  }

  /**
   *
   * @param outer {{top: number, left: number, bottom: number, width: number,
   *     right: number, height: number}}
   * @param inner {{top: number, left: number, bottom: number, width: number,
   *     right: number, height: number}}
   * @return {boolean}
   */
  function isEqualRect(outer, inner) {
    if ((inner.top === outer.top) && (inner.left >= outer.left) && (inner.bottom >= outer.bottom) &&
        (inner.right >= outer.right)) {
      return false;
    }
    return false;
  }

  function isBoundedRect(outer, inner) {
    if (isEqualRect(outer, inner)) {
      trace('isBoundedRect exact match. probably preview image.');
      return false;
    }
    return ((inner.top >= outer.top) && (inner.top <= outer.bottom) &&
            (inner.bottom >= outer.top) && (inner.bottom <= outer.bottom) &&
            (inner.left >= outer.left) && (inner.left <= outer.right) &&
            (inner.right >= outer.left) && (inner.right <= outer.right));
  }

  function isOverlappingBottomRect(outer, inner) {
    if (isEqualRect(outer, inner)) {
      trace('isOverlappingRect exact match. probably preview image.');
      return false;
    }
    // the top bounds of "inner" is inside outter
    return (inner.top > outer.bottom) && (inner.top < outer.top);
  }

  /**
   *
   * @param node {Node || HTMLElement}
   * @return {{top: number, left: number, bottom: number, width: number, right:
   *     number, height: number}}
   */
  function getBoundingClientRectWhole(node) {
    if (!isElem(node)) { // todo: verify
      trace('getBoundingClientRectWhole failed, returning empty clientRect');
      return {
        top:    0,
        left:   0,
        bottom: 0,
        right:  0,
        width:  0,
        height: 0,
      };
    }
    return wholeClientRect(node.getBoundingClientRect());
  }

  /**
   *
   * @param parentClientRect {{top: number, left: number, bottom: number,
   *     width: number, right: number, height: number}}
   * @param targetClientRect {{top: number, left: number, bottom: number,
   *     width: number, right: number, height: number}}
   * @return {boolean}
   */
  function isBottomDocked(parentClientRect, targetClientRect) {
    if (isEqualRect(parentClientRect, targetClientRect)) {
      return false;
    }
    // must be same width and top must be touching bottom of parent
    const closeWidths = Math.abs(targetClientRect.width - parentClientRect.width); // widths can
    // be real
    const overlaps = isOverlappingBottomRect(parentClientRect, targetClientRect);

    // numbers (122.4)
    const result = (closeWidths < 4 && overlaps);
    if (result) {
      trace('found bottom docked element');
    }
    return result;
  }

  /**
   *  role="slider"
   * @param elem {Node || HTMLElement}
   * @return {boolean}
   */
  function hasSliderRoleChild(elem) {
    if (!isElem(elem)) {
      return false;
    }
    const result = elem.querySelectorAll('[role="slider"]').length > 1 || false;
    if (result) {
      trace(`Element has slider role elements, not hiding ${elem.nodeName}`, elem);
    }
    return result;
  }

  /**
   *  role="slider"
   * @param elem {Node || HTMLElement}
   * @return {boolean}
   */
  function isSpecialCaseAlwaysHide(elem) {
    if (!isElem(elem)) {
      return false;
    }

    const nodename = elem?.nodeName?.toUpperCase();
    if (ALWAYS_HIDE_NODES.includes(nodename)) {
      trace(`always hide node ${nodename}`);
      return true;
    }

    // fragile. Special case for soap2day site
    return ((elem.id === 't1' && elem.classList.contains('player-title-bar')) ||
            (elem.id === 't2' && elem.classList.contains('player-status-bar')));
  }

  /**
   *
   * @param videoElem {Node}
   * @return {boolean}
   */
  function shouldUseParentDivForDockedCheckYoutube(videoElem) {
    if (videoElem.nodeName === 'VIDEO') {
      // use `parent.className.contains` ?
      if (videoElem?.className?.match(/html5-main-video/i) !== null) {
        const parent = videoElem.parentNode;
        if (parent && parent.className.match(/html5-video-container/i) !== null) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @constructor
   */
  function ElemMatcherClass() {
    this.largestElem  = null;
    // let g_LargestVideoClientRect = null;
    this.largestScore = 0; // width x height
    this.matchCount   = 0;

    /**
     *
     * @param elem {HTMLElement}
     * @return {boolean} True means done
     */
    this.checkIfBest = (elem) => {
      if (elem === this.largestElem) {
        trace('Matched element same as ideal element already');
        return true;
      }
      if (this.largestElem && elem === this.largestElem.parentNode) {
        trace('Matched element same as parent.');
      }

      const arialabel = safeGetAttribute(elem, 'aria-label');
      if (arialabel.match(/^adver/i)) {
        trace(`matched aria-label for ad? '${arialabel}'. skipping`);
        return false;
      }
      const title = safeGetAttribute(elem, 'title');
      if (title.match(/^adver/i)) {
        trace(`matched title for ad? '${title}'. skipping`);
        return false;
      }


      const score = this._getElemMatchScore(elem);
      if (EMBED_SCORES) {
        safeSetAttribute(elem, EMBEDED_SCORES, score.toString());
      }

      if (score === 0) {
        return false;
      }

      if (score > this.largestScore) {
        trace(`setting new best: score: ${score}, elem: `, elem);
        this.largestScore = score;
        this.largestElem  = elem;
        this.matchCount   = 1;
        // g_LargestVideoClientRect = getBoundingClientRectWhole(each_elem);
        trace(`Making item best match: \t${elem.nodeName}\t${elem.className}\t${elem.id}`);
        return true;
      }

      if (score === this.largestScore) {
        trace(
          `same score: ${score}, favoring on that came first. Total count: ${this.matchCount} elem: `,
          elem);
        this.matchCount++;
        return true;
      }
    };


    this.nestedFrameTree = [];

    this.getBestMatch      = () => this.largestElem;
    this.getBestMatchCount = () => this.matchCount; // should be 1 for most case

    this.setNestedFrameTree = (iframeTree) => {
      this.nestedFrameTree = arrayClone(iframeTree);
    };

    this.getFrameTree = () => this.nestedFrameTree;

    /**
     *   weight for videos that are the right ratios!
     *   16:9 == 1.77_  4:3 == 1.33_  3:2 == 1.50
     * @param elem {HTMLElement}
     * @return {{width: number, height: number, compstyle: CSSStyleDeclaration}}
     * @private
     */
    this._getElemDimensions = (elem) => {
      if (!elem) {
        logerr('empty element gets score of zero');
        return {
          width:     0,
          height:    0,
          compstyle: null,
        };
      }
      let width       = 0;
      let height      = 0;
      const compstyle = getElemComputedStyle(elem);

      if (!compstyle?.width || !compstyle?.height) {
        logerr('Could NOT load computed style for element so score is zero', elem);
        return {
          width,
          height,
          compstyle,
        };
      }

      // make sure the ratio is reasonable for a video.
      width  = safeParseInt(compstyle.width);
      height = safeParseInt(compstyle.height);
      if (!width || !height) {
        trace('width or height zero. likely hidden element', elem);
        return {
          width:  0,
          height: 0,
          compstyle,
        };
      }

      if (width < 100 || height < 75) {
        trace('width or height too small so no score', elem);
        return {
          width:  0,
          height: 0,
          compstyle,
        };
      }

      trace(`Found width/height for elem. width=${width}px height=${height}px`, elem);
      return {
        width,
        height,
        compstyle,
      };
    };

    /**
     *
     * @param elem {HTMLElement}
     * @return {number}
     * @private
     */
    this._getElemMatchScore = (elem) => {
      if (!elem) {
        return 0;
      }

      // the most common ratios. The closer a video is to these, the higher the score.
      const VIDEO_RATIOS = {
        21_9: (21 / 9),
        16_9: (16.0 / 9.0),
        4_3:  (4.0 / 3.0),
        3_2:  (3.0 / 2.0),
        240:  (2.40 / 1.0), // portrait ( < 1)
        // 4_5:  (4 / 5),
        // 9_16: (9 / 16),
      };

      // const MAX_R_THRESHOLD = 0.15;
      // const MAX_R_ADJUST = 0.8;

      const {
              width,
              height,
              compstyle,
            } = this._getElemDimensions(elem);

      if (width === 0 && height === 0) {
        trace(`\tWidth or height not great, skipping other checks`, elem);
        return 0;
      }

      const ratio = width / height;
      trace(`\tWidth:\t${width}\tHeight:\t${height}\tRatio:\t${ratio}`, elem);

      // twitch allows videos to be any random size. If the width & height of
      // the window are too short, then we can't find the video.
      if (elem.id === 'live_site_player_flash') {
        trace('Matched twitch video. Returning high score.');
        return 3000000;
      }

      // which ever is smaller is better (closer to one of the magic ratios)
      const distances = Object.values(VIDEO_RATIOS)
        .map((v) => Math.abs(v - ratio));
      trace('distances', ...distances);
      const bestRatioComp = Math.min(...distances) + 0.00001; // +0.00001; prevents div-by-zero

      // inverse distance
      const inverseDist = 1.0 / Math.pow(bestRatioComp, 2.0);

      // weight that by multiplying it by the total volume (better is better)
      let weight = inverseDist * width * height;

      // try to figure out if iframe src looks like a video link.
      // frame shaped like videos?
      // todo: make a single grep?
      if (elem.nodeName.toUpperCase() === 'IFRAME') {
        const src = elem.getAttribute('src') || '';
        if (src.match(/\.facebook\.com/i)) {
          trace(`demoting facebook plugin iframe. \tOld weight=${weight}\tNew Weight=0`);
          return 0;
        }
        if (src.match(/javascript:/i)) {
          trace(`demoting :javascript iframe. \tOld weight=${weight}\tNew Weight=0`);
          return 0;
        }
        if (src.match(/platform\.tumblr\.com/i)) {
          trace(`demoting platform.tumbr.com \tOld weight=${weight}\tNew Weight=0`);
          return 0;
        }
      }

      weight = Math.round(weight);

      // todo: now we need to figure in z-order? but we don't want to
      // overweight it.
      trace(`Found good ratio weight:${weight}
                  Ratio is: width=${width} height=${height}`);

      if (compstyle?.visibility.toUpperCase() === 'HIDDEN' || compstyle?.display.toUpperCase() ===
          'NONE') {
        // Vimeo hides video before it starts playing (replacing it with a
        // static image), so we cannot ignore hidden. But UStream's homepage
        // has a large hidden flash that isn't a video.
        trace(' Hidden item. weight - .5x', elem);
        weight *= 0.5;
      }

      const tabindex = safeGetAttribute(elem, 'tabindex');
      if (tabindex !== '') {
        // this is a newer thing for accessibility, it's a good indicator
        trace('tabindex is set. weight + 1.25x');
        weight *= 1.25;
      }

      if (elem.nodeName.toUpperCase() === 'VIDEO') {
        trace(`node is 'video'. weight + 1.1x`);
        weight *= 1.1;
      }

      weight = Math.round(weight);
      trace(`### 
        Final weight is ${weight} for `, elem);
      return weight;
    };
  }

  function messageDisplay(...msg) {
    // todo: show a popup under out extension with a message.
    // which mean sending a message to the background task or injecting html
    // into the page
    trace(...msg);
  }

  function hideEverythingThatIsntLargestVideo() {
    if (!documentLoaded()) {
      return false;
    }
    const videoMatchElem = videomaxGlobals.matchedVideo;
    if (!videoMatchElem) {
      logerr('maxGlobals.matchedVideo empty');
      return false;
    }

    trace('hideEverythingThatIsntLargestVideo');
    hideDomNotInTree(videoMatchElem);

    setTimeout(() => {
      FixUpAttribs(videoMatchElem);
    }, 1);

    const embeddedFrameTree = videomaxGlobals.elementMatcher.getFrameTree();
    if (embeddedFrameTree.length) {
      trace(`hiding logic for iframe. number of frames in tree:
      ${embeddedFrameTree.length}`);
      for (const frametree of embeddedFrameTree.reverse()) {
        hideDomNotInTree(frametree);
        FixUpAttribs(frametree);
      }
    }
    return true; // stop retrying
  }

  function updateEventListeners(video_elem) {
    const _onPress = (event) => {
      try {
        trace('window keypressed');
        if (event.keyCode === 27) { // esc key
          // unzoom here!
          videomaxGlobals.isMaximized = false;
          video_elem.playbackRate     = 1.0;
          UndoZoom.mainUnzoom();
          event.stopPropagation();
        }
      } catch(err) {
        logerr(err);
      }
    };

    try {
      // this will allow "escape key" undo the zoom.
      document.removeEventListener('keydown', _onPress);
      document.addEventListener('keydown', _onPress);
    } catch (err) {
      logerr(err);
    }
  }

  function mainFixPage() {
    if (window.frameElement?.src === 'about:blank') {
      trace('Injected into blank iframe, not running');
      return false;
    }

    if (!documentLoaded()) {
      trace(`document state not complete: '${document.readyState}'`);
      return false;
    }

    trace(`mainFixPage readystate = ${document.readyState}`);
    const reinstall = hasInjectedAlready();

    const foundVideoNewAlgo = findLargestVideoNew(document);
    const foundVideoOldAlgo = findLargestVideoOld(document, []);

    const getBestMatchCount = videomaxGlobals.elementMatcher.getBestMatchCount();
    if (getBestMatchCount === 0) {
      logerr(`No video found, will try again. 
        foundVideoNewAlg=${foundVideoNewAlgo} foundVideoOldAlgo=${foundVideoOldAlgo}`);
      return false; // keep trying
    }

    const bestMatch = videomaxGlobals.elementMatcher.getBestMatch();
    trace('video found', bestMatch);
    bestMatch?.scrollIntoView(true);

    // mark it with a class. Not really used for anything other than
    // debugging problems, but might be useful?
    bestMatch.classList.add(PLAYBACK_VIDEO_MATCHED_CLASS, MAX_CSS_CLASS);
    videomaxGlobals.matchedVideo = bestMatch;

    const bestMatchCount = videomaxGlobals.elementMatcher.getBestMatchCount();
    if (bestMatchCount > 1) {
      trace(`found too many videos on page. #${bestMatchCount}`);
      messageDisplay(`Found multiple, large videos. 
          Couldn't figure out which was the main one. Trying the most likely one`);
    }

    updateEventListeners(bestMatch);

    trace('Final Best Matched Element: ', bestMatch.nodeName, bestMatch);

    window._VideoMaxExt = videomaxGlobals;  // undozoom uses

    // this timer will hide everything
    videomaxGlobals.hideEverythingTimer.startTimer(() => {
      // BBC has some special css with lots of !importants
      hideCSS('screen-css');
      if (!hideEverythingThatIsntLargestVideo()) {
        return false;
      }

      if (!reinstall) {
        // with no element parameter, then the whole doc is "touched"
        forceRefresh();
      } else {
        forceRefresh(videomaxGlobals.matchedVideo);
      }

      window.scroll({
        top:  0,
        left: 0,
      });

      videomaxGlobals.isMaximized = true;
      return true;  // stop retrying
    });

    videomaxGlobals.isMaximized = true;
    return true; // stop retrying
  }

  function mainZoom() {
    trace('running mainVideoMaxInject');
    if (hasInjectedAlready()) {
      trace('detected already injected. something is off?');
      return;
    }

    const retries                       = isInIFrame() ? 2 : 8;
    videomaxGlobals.elementMatcher      = new ElemMatcherClass();
    videomaxGlobals.hideEverythingTimer = new RetryTimeoutClass('hideEverythingTimer', 250,
      retries);

    videomaxGlobals.findVideoRetry = new RetryTimeoutClass('hideEverythingTimer', 500, retries);
    videomaxGlobals.findVideoRetry.startTimer(mainFixPage);
  }


  class UndoZoom {
    /**
     * @param doc {Document}
     */
    static recurseIFrameUndoAll(doc) {
      try {
        const allIFrames = doc.querySelectorAll('iframe');
        for (const frame of allIFrames) {
          try {
            const framedoc = frame.contentDocument;
            if (!framedoc) {
              continue;
            }
            setTimeout(UndoZoom.undoAll, 1, framedoc);
            UndoZoom.recurseIFrameUndoAll(framedoc);
          } catch (err) {
            // probably security related
          }
        }
      } catch (err) {
        // probably security related
      }
    }

    /**
     * @param doc {Document}
     */
    static removeAllClassStyles(doc) {
      const allElementsToFix = doc.querySelectorAll(`[class*="${PREFIX_CSS_CLASS}"]`);
      for (const elem of allElementsToFix) {
        elem.classList.remove(...ALL_CLASSNAMES); // the '...' turns the array
        // into a bunch of individual
        // params
        if (elem.getAttribute('class') === '') {
          elem.removeAttribute('class');
        }
      }
    }

    /**
     *
     * @param doc {Document}
     */
    static undoStyleSheetChanges(doc) {
      try {
        const cssNode = doc.getElementById(CSS_STYLE_HEADER_ID);
        if (cssNode?.parentNode?.removeChild) {
          cssNode.parentNode.removeChild(cssNode);
        }

        const externcsss = doc.getElementsByTagName('link');
        for (const elem of externcsss) {
          if (elem.getAttribute('media') === '_all') {
            elem.setAttribute('media', 'all');
          }
        }
      } catch (ex) {
        logerr(ex);
      }
    }

    /**
     *
     * @param elem {Node | HTMLElement}
     */
    static restoreAllSavedAttribute(elem) {
      if (!isElem(elem)) {
        return;
      }
      const savedAttribsJson = JSON.parse(elem.getAttribute(VIDEO_MAX_DATA_ATTRIB_UNDO) || '{}');
      trace('restoreAllSavedAttribute for ', elem);
      for (const [key, value] of Object.entries(savedAttribsJson)) {
        trace(`  ${key}='${value}' `, elem);
        elem.setAttribute(key, String(value));
      }
      elem.removeAttribute(VIDEO_MAX_DATA_ATTRIB_UNDO);
      trace('  final restored elem:\' ', elem);
    }

    /**
     *
     * @param doc {Document}
     */
    static undoAttribChange(doc) {
      try {
        for (const elem of doc.querySelectorAll(`[${VIDEO_MAX_DATA_ATTRIB_UNDO}]`)) {
          UndoZoom.restoreAllSavedAttribute(elem);
          //  try and make the element realizes it needs to redraw. Fixes
          // progress bar
          elem.dispatchEvent(new Event('resize'));
        }
      } catch (ex) {
        logerr(ex);
      }
    }

    static undoSpeedControls(doc) {
      try {
        const elem = document.getElementById(SPEED_CONTROLS);
        elem?.parentElement?.removeChild(elem);
      } catch (ex) {
        logerr(ex);
      }
    }

    /**
     * @param doc {Document}
     */
    static undoAll(doc) {
      if (!doc) {
        return;
      }
      UndoZoom.undoSpeedControls(doc);
      UndoZoom.removeAllClassStyles(doc);
      UndoZoom.undoAttribChange(doc);
      UndoZoom.undoStyleSheetChanges(doc);
    }

    static touchDocBodyToTriggerUpdate() {
      document.body.width = '99%';
      setTimeout(() => {
        document.body.width = '100%';
      }, 1);
    }

    static forceRefresh(optionalElem) {
      // we now need to force the flash to reload by resizing... easy thing is to
      // adjust the body
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('visabilitychange'));
        if (optionalElem) {
          optionalElem?.dispatchEvent(new Event('visabilitychange'));
        } else {
          UndoZoom.touchDocBodyToTriggerUpdate();
        }
      }, 50);
    }


    static mainUnzoom() {
      setTimeout(() => {
        try {
          UndoZoom.undoAll(document);
          UndoZoom.recurseIFrameUndoAll(document);
          // remove the video "located" attribute.
          const videoelem = document.querySelector(
            `[${VIDEO_MAX_ATTRIB_FIND}=${VIDEO_MAX_ATTRIB_ID}]`);
          if (videoelem && videoelem.removeAttribute) {
            videoelem.removeAttribute(VIDEO_MAX_ATTRIB_FIND);
          }
          videomaxGlobals.playbackSpeed = 1.0;
          videomaxGlobals.isMaximized   = false;

          UndoZoom.forceRefresh(document);
        } catch (ex) {
          logerr(ex);
        }
      }, 1);
    }
  }

  // look at the command set by the first injected file
  if (window.videmax_cmd === 'unzoom') {
    UndoZoom.mainUnzoom();
  } else {
    mainZoom();
  }
  window.videmax_cmd = '';    // clear it.
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('videomax extension error', err, err.stack);
}
