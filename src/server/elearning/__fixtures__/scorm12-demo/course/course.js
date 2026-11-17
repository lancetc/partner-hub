/*
  A small SCORM 1.2 course for testing the Hub's player: three pages with a bookmark and resume data,
  then a one-question check that reports passed or failed with a score. It finds the API the standard
  way (up through the parent frames), and does only what real courses do: Initialize, read entry,
  location and suspend data, set values, Commit, Finish. Not an Articulate course: those are tested
  with real exports.
*/
(function () {
  "use strict";
  function findAPI(win) {
    for (var i = 0; win && i < 10; i++) {
      if (win.API) return win.API;
      if (win.parent === win) break;
      win = win.parent;
    }
    return null;
  }
  var api = findAPI(window) || (window.opener && findAPI(window.opener));
  var log = document.getElementById("log");
  function note(t) { log.textContent += t + "\n"; }
  if (!api) {
    document.getElementById("body").textContent = "No SCORM API found. This course must be opened from a learning system.";
    return;
  }
  api.LMSInitialize("");
  var entry = api.LMSGetValue("cmi.core.entry");
  var page = Number(api.LMSGetValue("cmi.core.lesson_location") || "1");
  var visited = api.LMSGetValue("cmi.suspend_data") || "";
  document.getElementById("who").textContent = "Learner: " + api.LMSGetValue("cmi.core.student_name") + " · entry: " + (entry || "(blank)");
  note("Started. entry=" + entry + " location=" + (api.LMSGetValue("cmi.core.lesson_location") || "(none)") + " suspend_data=" + (visited || "(none)"));
  if (api.LMSGetValue("cmi.core.lesson_status") === "not attempted") api.LMSSetValue("cmi.core.lesson_status", "incomplete");

  var pages = ["Welcome. This course has three pages and a quick check.", "Page two: your progress is saved as you go.", "Page three: next is the check."];

  function save(p) {
    page = p;
    if (visited.indexOf("p" + p) < 0) visited += (visited ? "," : "") + "p" + p;
    api.LMSSetValue("cmi.core.lesson_location", String(p));
    api.LMSSetValue("cmi.suspend_data", visited);
    api.LMSCommit("");
    note("Saved page " + p + " · suspend_data=" + visited);
  }

  function button(label, fn, alt) {
    var b = document.createElement("button");
    b.textContent = label;
    if (alt) b.className = "alt";
    b.onclick = fn;
    document.getElementById("actions").appendChild(b);
  }

  function render() {
    var actions = document.getElementById("actions");
    actions.innerHTML = "";
    if (page <= pages.length) {
      document.getElementById("title").textContent = "Page " + page + " of " + pages.length;
      document.getElementById("body").textContent = pages[page - 1];
      button(page < pages.length ? "Next" : "Go to the check", function () { save(page + 1); render(); });
      button("Save and exit", function () {
        api.LMSSetValue("cmi.core.exit", "suspend");
        api.LMSFinish("");
        note("Exited (suspend).");
      }, true);
    } else {
      document.getElementById("title").textContent = "Quick check";
      document.getElementById("body").textContent = "Who directs a self-managed client's care?";
      function answer(right) {
        api.LMSSetValue("cmi.core.score.min", "0");
        api.LMSSetValue("cmi.core.score.max", "100");
        api.LMSSetValue("cmi.core.score.raw", right ? "100" : "0");
        api.LMSSetValue("cmi.core.lesson_status", right ? "passed" : "failed");
        api.LMSSetValue("cmi.core.exit", "");
        api.LMSCommit("");
        api.LMSFinish("");
        document.getElementById("body").textContent = right ? "Correct. You passed." : "Not quite. You didn't pass this time.";
        document.getElementById("actions").innerHTML = "";
        note("Finished: " + (right ? "passed" : "failed"));
      }
      button("The client", function () { answer(true); });
      button("The support worker", function () { answer(false); }, true);
    }
  }
  render();
})();
