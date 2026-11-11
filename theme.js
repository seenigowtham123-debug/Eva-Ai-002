// Runs before first paint so the page never flashes the wrong theme. Also explains the file:// mistake.
(function () {
  var pref = "dark";
  try { pref = JSON.parse(localStorage.getItem("eva.settings") || "{}").theme || "dark"; } catch (e) { /* ignore */ }
  var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  if (location.protocol === "file:") {
    document.addEventListener("DOMContentLoaded", function () {
      var b = document.getElementById("boot");
      if (b) b.innerHTML = "<h2>Start the server first</h2><p>You opened index.html as a file. Run <code>node server.js</code> (or double-click start.bat), then open <b>http://localhost:3000</b> in your browser.</p>";
    });
  }
})();
