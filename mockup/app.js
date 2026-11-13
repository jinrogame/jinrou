(() => {
  const screenOrder = [
    "screen-01",
    "screen-02",
    "screen-03",
    "screen-04",
    "screen-05",
    "screen-06",
    "screen-07",
    "screen-08",
    "screen-09",
    "screen-10",
    "screen-11",
    "screen-12a",
    "screen-12b",
    "screen-13",
    "screen-14",
  ];

  const screenSelect = document.getElementById("screen-jump-select");
  const headingEl = document.getElementById("current-screen-heading");

  function showScreen(screenId) {
    for (const id of screenOrder) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle("is-active", id === screenId);
      }
    }
    if (screenSelect) {
      screenSelect.value = screenId;
      const selectedOption = screenSelect.options[screenSelect.selectedIndex];
      if (selectedOption && headingEl) {
        headingEl.textContent = selectedOption.textContent;
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Screen transition buttons
  for (const btn of document.querySelectorAll("[data-go]")) {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (target) showScreen(target);
    });
  }

  // Top jump bar
  if (screenSelect) {
    screenSelect.addEventListener("change", () => {
      showScreen(screenSelect.value);
    });
  }

  const prevBtn = document.getElementById("btn-prev-screen");
  const nextBtn = document.getElementById("btn-next-screen");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      const idx = screenOrder.indexOf(screenSelect.value);
      const prevIdx = (idx - 1 + screenOrder.length) % screenOrder.length;
      showScreen(screenOrder[prevIdx]);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const idx = screenOrder.indexOf(screenSelect.value);
      const nextIdx = (idx + 1) % screenOrder.length;
      showScreen(screenOrder[nextIdx]);
    });
  }

  // [画面02] Role configuration calculator (Checkboxes for Citizen special roles)
  const wolfCounts = { god: 1, wolf: 1, mad: 0, psycho: 1 };
  const wolfEls = {
    god: document.getElementById("count-wolf-god"),
    wolf: document.getElementById("count-wolf-normal"),
    mad: document.getElementById("count-wolf-mad"),
    psycho: document.getElementById("count-wolf-psycho"),
  };
  const wolfTotalEl = document.getElementById("wolf-total-count");
  const autoCitizenEl = document.getElementById("auto-citizen-count");
  const citizenCheckboxes = document.querySelectorAll(".citizen-role-cb");

  function updateRoleAllocation() {
    const wolfTotal = wolfCounts.god + wolfCounts.wolf + wolfCounts.mad + wolfCounts.psycho;
    if (wolfTotalEl) wolfTotalEl.textContent = String(wolfTotal);

    let specialCitizenSlots = 0;
    for (const cb of citizenCheckboxes) {
      if (cb.checked) {
        specialCitizenSlots += Number(cb.getAttribute("data-slots") || 1);
      }
    }
    const remainingCitizens = Math.max(0, 10 - wolfTotal - specialCitizenSlots);
    if (autoCitizenEl) {
      autoCitizenEl.textContent = `${remainingCitizens}人`;
    }
  }

  for (const btn of document.querySelectorAll("[data-wolf-role]")) {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-wolf-role");
      const delta = Number(btn.getAttribute("data-delta") || 0);
      if (key && key in wolfCounts) {
        wolfCounts[key] = Math.max(0, Math.min(5, wolfCounts[key] + delta));
        if (wolfEls[key]) wolfEls[key].textContent = String(wolfCounts[key]);
        updateRoleAllocation();
      }
    });
  }

  for (const cb of citizenCheckboxes) {
    cb.addEventListener("change", updateRoleAllocation);
  }

  // [画面04] Role reveal preview tabs
  const roleCardImg = document.getElementById("role-card-img");
  const roleCardTitle = document.getElementById("role-card-title");
  const roleCardDesc = document.getElementById("role-card-desc");
  const roleTabs = document.querySelectorAll("#role-preview-tabs .tab-chip");

  for (const tab of roleTabs) {
    tab.addEventListener("click", () => {
      for (const t of roleTabs) t.classList.remove("is-selected");
      tab.classList.add("is-selected");
      if (roleCardImg) roleCardImg.src = tab.getAttribute("data-role-img") || "";
      if (roleCardTitle) roleCardTitle.textContent = tab.getAttribute("data-role-name") || "";
      if (roleCardDesc) roleCardDesc.textContent = tab.getAttribute("data-role-extra") || "";
    });
  }

  // [画面08] Effect (Reward / Penalty) preview switcher
  const effectImg = document.getElementById("announce-effect-img");
  const effectTitle = document.getElementById("announce-effect-title");
  const effectDesc = document.getElementById("announce-effect-desc");
  const effectTabs = document.querySelectorAll("#effect-preview-tabs .tab-chip");

  for (const tab of effectTabs) {
    tab.addEventListener("click", () => {
      for (const t of effectTabs) t.classList.remove("is-selected");
      tab.classList.add("is-selected");
      if (effectImg) effectImg.src = tab.getAttribute("data-effect-img") || "";
      if (effectTitle) effectTitle.textContent = tab.getAttribute("data-effect-title") || "";
      if (effectDesc) effectDesc.textContent = tab.getAttribute("data-effect-desc") || "";
    });
  }

  // [画面09] Mini-game 5-type switcher & lightweight interactions
  const mgTabs = document.querySelectorAll("#minigame-preview-tabs .tab-chip");
  const mgPanels = document.querySelectorAll(".mg-panel");

  for (const tab of mgTabs) {
    tab.addEventListener("click", () => {
      for (const t of mgTabs) t.classList.remove("is-selected");
      tab.classList.add("is-selected");
      const targetId = tab.getAttribute("data-mg");
      for (const panel of mgPanels) {
        panel.hidden = panel.id !== targetId;
      }
    });
  }

  const mashBtn = document.getElementById("btn-mash-tap");
  const mashTotalEl = document.getElementById("mash-total");
  const mashMyEl = document.getElementById("mash-my-count");
  let mashTotal = 742;
  let mashMy = 92;

  if (mashBtn) {
    mashBtn.addEventListener("click", () => {
      mashTotal += 1;
      mashMy += 1;
      if (mashTotalEl) mashTotalEl.textContent = String(mashTotal);
      if (mashMyEl) mashMyEl.textContent = String(mashMy);
    });
  }

  const stop10Btn = document.getElementById("btn-stop10");
  const stop10Display = document.getElementById("stop10-display");
  if (stop10Btn && stop10Display) {
    stop10Btn.addEventListener("click", () => {
      stop10Display.textContent = "10.12 秒 (成功!)";
    });
  }

  // [画面13] Night sub-panel switcher
  const nightTabs = document.querySelectorAll("#night-view-tabs .tab-chip");
  const nightPanels = document.querySelectorAll(".night-panel");

  for (const tab of nightTabs) {
    tab.addEventListener("click", () => {
      for (const t of nightTabs) t.classList.remove("is-selected");
      tab.classList.add("is-selected");
      const targetId = tab.getAttribute("data-night-panel");
      for (const panel of nightPanels) {
        panel.hidden = panel.id !== targetId;
      }
    });
  }

  // Native <dialog> modal for Seer / Medium immediate results
  const skillDialog = document.getElementById("skill-result-dialog");
  const skillDialogTitle = document.getElementById("skill-dialog-title");
  const skillDialogBody = document.getElementById("skill-dialog-body");

  function openSkillModal(title, bodyText) {
    if (!skillDialog) return;
    if (skillDialogTitle) skillDialogTitle.textContent = title;
    if (skillDialogBody) skillDialogBody.textContent = bodyText;
    skillDialog.showModal();
  }

  if (skillDialog) {
    skillDialog.addEventListener("close", () => {
      skillDialog.returnValue = "";
    });
  }

  const firstNightSeerBtn = document.getElementById("btn-first-night-seer");
  if (firstNightSeerBtn) {
    firstNightSeerBtn.addEventListener("click", () => {
      const checked = document.querySelector('input[name="first-night-seer"]:checked');
      const val = checked ? checked.value : "じろう（人狼）";
      openSkillModal("🔮 初日の夜・占い結果", `選択したプレイヤーの判定結果：${val}`);
    });
  }

  const openSeerModalBtn = document.getElementById("btn-open-seer-modal");
  if (openSeerModalBtn) {
    openSeerModalBtn.addEventListener("click", () => {
      openSkillModal("🔮 占い結果（即時表示）", "じろう さんは【人狼】でした。");
    });
  }

  const openMediumModalBtn = document.getElementById("btn-open-medium-modal");
  if (openMediumModalBtn) {
    openMediumModalBtn.addEventListener("click", () => {
      openSkillModal("🕯️ 霊媒結果（即時表示）", "直前の投票で追放された さぶろう さんは【人間】でした。");
    });
  }

  // [画面14] Ending banner preview switcher
  const endingImg = document.getElementById("ending-banner-img");
  const endingTitle = document.getElementById("ending-title");
  const endingSub = document.getElementById("ending-sub");
  const endingTabs = document.querySelectorAll("#ending-preview-tabs .tab-chip");

  for (const tab of endingTabs) {
    tab.addEventListener("click", () => {
      for (const t of endingTabs) t.classList.remove("is-selected");
      tab.classList.add("is-selected");
      if (endingImg) endingImg.src = tab.getAttribute("data-end-img") || "";
      if (endingTitle) endingTitle.textContent = tab.getAttribute("data-end-title") || "";
      if (endingSub) endingSub.textContent = tab.getAttribute("data-end-sub") || "";
    });
  }
})();
