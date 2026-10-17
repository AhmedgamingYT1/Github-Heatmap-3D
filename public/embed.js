/*! GitHub Heatmap 3D embed — https://github.com/vimalsri318/Github-Heatmap-3D
 *
 * <div data-github-heatmap-3d data-user="octocat" data-theme="ocean" style="height: 420px"></div>
 * <script src="https://YOUR-SITE/embed.js" async></script>
 *
 * Every option from the site works as a data-* attribute (data-auto-rotate="0", data-bar-size="0.6", ...).
 */
(function () {
  var script = document.currentScript;
  var origin = new URL(script ? script.src : location.href).origin;

  function mount(el) {
    if (el.__heatmap3d) return;
    el.__heatmap3d = true;
    var params = new URLSearchParams();
    for (var key in el.dataset) {
      if (key !== 'githubHeatmap-3d' && key !== 'githubHeatmap3d') params.set(key, el.dataset[key]);
    }
    if (!el.style.height && !el.clientHeight) el.style.height = '420px';
    var frame = document.createElement('iframe');
    frame.src = origin + '/embed.html?' + params.toString();
    frame.title = (el.dataset.user || 'GitHub') + ' contributions in 3D';
    frame.loading = 'lazy';
    frame.allowTransparency = true;
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent';
    el.appendChild(frame);
  }

  function mountAll() {
    document.querySelectorAll('[data-github-heatmap-3d]').forEach(mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
  window.GithubHeatmap3D = { mount: mount, mountAll: mountAll };
})();
