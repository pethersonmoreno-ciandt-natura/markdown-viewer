
md.messages = ({storage: {defaults, state, set}, compilers, mathjax, xhr, webrequest, icon}) => {

  return (req, sender, sendResponse) => {
    // Validação de remetente interno
    var isExtensionPage = sender.url.startsWith(chrome.runtime.getURL(''));
    var isSensitiveCommand = /^(popup|options|origin|custom)\./.test(req.message);

    if (isSensitiveCommand && !isExtensionPage) {
      console.warn('Tentativa bloqueada de escalonamento de privilégio:', req.message);
      return sendResponse({error: 'Acesso negado: Contexto não confiável.'});
    }

    // content
    if (req.message === 'markdown') {
      var markdown = req.markdown

      if (state.content.mathjax) {
        var jax = mathjax()
        markdown = jax.tokenize(markdown)
      }

      var html = compilers[state.compiler].compile(markdown)

      if (state.content.mathjax) {
        html = jax.detokenize(html)
      }

      sendResponse({message: 'html', html})
    }
    else if (req.message === 'autoreload') {
      if (req.location !== sender.url && req.location !== (sender.tab && sender.tab.url)) {
        return sendResponse({err: 'Acesso negado: URL de autoreload inválida.'})
      }

      xhr.get(req.location, (err, body) => {
        sendResponse({err, body})
      })
    }
    else if (req.message === 'prism') {
      if (!/^[a-zA-Z0-9_-]+$/.test(req.language)) {
        return sendResponse({error: 'Language inválida.'});
      }

      chrome.scripting.executeScript({
        target: {tabId: sender.tab.id},
        files: [
          `/vendor/prism/prism-${req.language}.min.js`,
        ],
        injectImmediately: true
      }, sendResponse)
    }
    else if (req.message === 'mathjax') {
      if (!/^[a-zA-Z0-9_-]+$/.test(req.extension)) {
        return sendResponse({error: 'Extension inválida.'});
      }

      chrome.scripting.executeScript({
        target: {tabId: sender.tab.id},
        files: [
          `/vendor/mathjax/extensions/${req.extension}.js`,
        ],
        injectImmediately: true
      }, sendResponse)
    }

    // popup
    else if (req.message === 'popup') {
      sendResponse(Object.assign({}, state, {
        options: state[state.compiler],
        description: compilers[state.compiler].description,
        compilers: Object.keys(compilers),
        themes: state.themes,
        settings: {theme: state.settings.theme}
      }))
    }
    else if (req.message === 'popup.theme') {
      set({theme: req.theme})
      notifyContent({message: 'theme', theme: req.theme})
      sendResponse()
    }
    else if (req.message === 'popup.raw') {
      set({raw: req.raw})
      notifyContent({message: 'raw', raw: req.raw})
      sendResponse()
    }
    else if (req.message === 'popup.themes') {
      set({themes: req.themes})
      notifyContent({message: 'themes', themes: req.themes})
      sendResponse()
    }
    else if (req.message === 'popup.defaults') {
      var options = Object.assign({}, defaults)
      options.origins = state.origins
      set(options)
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.name') {
      set({compiler: req.compiler})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.compiler.options') {
      set({[req.compiler]: req.options})
      notifyContent({message: 'reload'})
      sendResponse()
    }
    else if (req.message === 'popup.content') {
      set({content: req.content})
      notifyContent({message: 'reload'})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'popup.advanced') {
      // ff: opens up about:addons with openOptionsPage
      if (/Firefox/.test(navigator.userAgent)) {
        chrome.management.getSelf((extension) => {
          chrome.tabs.create({url: extension.optionsUrl})
        })
      }
      else {
        chrome.runtime.openOptionsPage()
      }
      sendResponse()
    }

    // origins view
    else if (req.message === 'options.origins') {
      sendResponse({
        origins: state.origins,
        match: state.match,
      })
    }
    // origins options
    else if (req.message === 'origin.add') {
      state.origins[req.origin] = {
        header: true,
        path: true,
        match: defaults.match,
      }
      set({origins: state.origins})
      sendResponse()
    }
    else if (req.message === 'origin.remove') {
      delete state.origins[req.origin]
      set({origins: state.origins})
      webrequest()
      sendResponse()
    }
    else if (req.message === 'origin.update') {
      state.origins[req.origin] = req.options
      set({origins: state.origins})
      webrequest()
      sendResponse()
    }

    // settings view
    else if (req.message === 'options.settings') {
      sendResponse(state.settings)
    }
    // settings options
    else if (req.message === 'options.icon') {
      set({settings: req.settings})
      icon()
      sendResponse()
    }
    else if (req.message === 'options.theme') {
      set({settings: req.settings})
      sendResponse()
    }
    else if (req.message === 'custom.get') {
      sendResponse(state.custom)
    }
    else if (req.message === 'custom.set') {
      set({custom: req.custom}).then(sendResponse).catch((err) => {
        if (/QUOTA_BYTES_PER_ITEM quota exceeded/.test(err.message)) {
          sendResponse({error: 'Minified theme exceeded 8KB in size!'})
        }
      })
    }

    return true
  }

  function notifyContent (req, res) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, req, res)
    })
  }
}
