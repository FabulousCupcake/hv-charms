(function () {
  const POUCHES = [
    { name: "Silk Pouch", label: "S", cost: 0 },
    { name: "Kevlar Pouch", label: "K", cost: 1 },
    { name: "Mithril Pouch", label: "M", cost: 2 },
  ];
  const FAVORITES_KEY = "hv-charms:favorites";
  const ANIMATION_DURATION = 200;
  const LIST_CAVE_DELAY = 45;
  const LIST_CAVE_DURATION = ANIMATION_DURATION - LIST_CAVE_DELAY;
  const RETURN_IMPACT_DURATION = 1500;
  const FAVORITE_PRESET_TOTAL_DURATION = 250;
  const FAVORITE_PRESET_ITEM_DURATION = 100;
  const CLEAR_SELECTION_TOTAL_DURATION = 250;
  let returnImpactSequence = 0;
  let favoritePresetSequence = 0;
  let clearSelectionSequence = 0;
  const activeReturnImpacts = new Map();
  let charmAvailabilityFreeze = null;
  let charmAvailabilityFreezeSequence = 0;
  const FAVORITE_PRESETS = {
    magic: ["archmage", "aether", "annihilator", "economizer", "penetrator", "spellweaver"],
    melee: ["butcher", "fatality", "swiftness", "overpower"],
    elemental: [
      "cold strike",
      "fire strike",
      "holy strike",
      "lightning strike",
      "dark strike",
      "wind strike",
      "hollowforged",
      "voidseeker",
    ],
  };

  const state = {
    charms: [],
    favorites: new Set(),
    selections: Array.from({ length: 7 }, () => null),
    slotPouches: Array.from({ length: 7 }, () => POUCHES[0]),
    slots: 7,
    maxCp: 100,
    itemType: "Weapon",
    applyingHash: false,
  };

  const els = {
    selectedRemainingCp: document.getElementById("selectedRemainingCp"),
    slotInput: document.getElementById("slotInput"),
    cpInput: document.getElementById("cpInput"),
    clearButton: document.getElementById("clearButton"),
    charmList: document.getElementById("charmList"),
    selectionList: document.getElementById("selectionList"),
    presetButtons: Array.from(document.querySelectorAll(".preset")),
    itemButtons: Array.from(document.querySelectorAll(".item-toggle")),
    favoritePresetButtons: Array.from(document.querySelectorAll("[data-favorite-preset]")),
  };

  function charmFamily(name) {
    return name
      .replace(/^(Lesser|Greater)\s+/i, "")
      .replace(/\s+Charm$/i, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCharm(raw, index) {
    return {
      id: index,
      name: raw.charm,
      cost: Number(raw.charmPointCost),
      effects: raw.effects,
      slot: raw.slot,
      family: charmFamily(raw.charm),
    };
  }

  function isCompatible(charm) {
    return charm.slot === "All" || charm.slot === state.itemType;
  }

  function loadFavorites() {
    try {
      const ids = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      state.favorites = new Set(ids.filter(Number.isInteger));
    } catch {
      state.favorites = new Set();
    }
  }

  function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  }

  function charmRowRects() {
    return new Map(
      Array.from(els.charmList.querySelectorAll(".charm-row")).map((row) => [
        row.dataset.charmId,
        row.getBoundingClientRect(),
      ])
    );
  }

  function freezeCharmAvailability() {
    const token = ++charmAvailabilityFreezeSequence;
    const snapshot = new Map(
      Array.from(els.charmList.querySelectorAll(".charm-row")).map((row) => [
        Number(row.dataset.charmId),
        { available: !row.classList.contains("unavailable") },
      ])
    );

    charmAvailabilityFreeze = { token, snapshot };
    return token;
  }

  function frozenCharmStatus(charm, status) {
    if (!charmAvailabilityFreeze) return status;

    const frozen = charmAvailabilityFreeze.snapshot.get(charm.id);
    return {
      ...status,
      available: frozen ? frozen.available : true,
    };
  }

  function thawCharmAvailability(token) {
    if (!charmAvailabilityFreeze || charmAvailabilityFreeze.token !== token) return;
    charmAvailabilityFreeze = null;
    renderCharms();
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function charmListRow(charmId) {
    return els.charmList.querySelector(`[data-charm-id="${charmId}"]`);
  }

  function applyCharmReturnImpact(row) {
    const impact = activeReturnImpacts.get(row.dataset.charmId);
    if (!impact) return;

    row.dataset.returnImpact = impact.token;
    row.style.setProperty("--charm-return-impact-delay", `${impact.delay}ms`);
    row.classList.add("charm-return-impact");
    row.classList.toggle("charm-return-impact-merge-top", Boolean(impact.mergeTop));
  }

  function triggerCharmReturnImpact(row, options = {}) {
    if (!row || prefersReducedMotion()) return;

    const charmId = row.dataset.charmId;
    if (!charmId) return;

    const token = String((returnImpactSequence += 1));
    const skipped = clamp(options.skip ?? 0, 0, 1);
    const delay = -RETURN_IMPACT_DURATION * skipped;
    const remainingDuration = RETURN_IMPACT_DURATION * (1 - skipped);
    activeReturnImpacts.set(charmId, { token, delay, mergeTop: false });
    row.classList.remove("charm-return-impact", "charm-return-impact-merge-top");
    row.style.removeProperty("--charm-return-impact-delay");

    const startImpact = () => {
      const impact = activeReturnImpacts.get(charmId);
      if (impact?.token !== token) return;
      const currentRow = charmListRow(charmId);
      if (!currentRow) return;

      const previousRow = currentRow.previousElementSibling;
      impact.mergeTop = Boolean(
        impact.mergeTop ||
          previousRow?.classList.contains("charm-return-impact")
      );

      currentRow.dataset.returnImpact = token;
      currentRow.style.setProperty("--charm-return-impact-delay", `${delay}ms`);
      void currentRow.offsetWidth;
      currentRow.classList.add("charm-return-impact");
      currentRow.classList.toggle("charm-return-impact-merge-top", impact.mergeTop);

      const nextRow = currentRow.nextElementSibling;
      if (nextRow?.classList.contains("charm-return-impact")) {
        const nextImpact = activeReturnImpacts.get(nextRow.dataset.charmId);
        if (nextImpact) nextImpact.mergeTop = true;
        nextRow.classList.add("charm-return-impact-merge-top");
      }

      window.setTimeout(() => {
        if (activeReturnImpacts.get(charmId)?.token !== token) return;
        activeReturnImpacts.delete(charmId);

        const latestRow = charmListRow(charmId);
        if (latestRow?.dataset.returnImpact !== token) return;
        latestRow.classList.remove("charm-return-impact", "charm-return-impact-merge-top");
        latestRow.style.removeProperty("--charm-return-impact-delay");
        delete latestRow.dataset.returnImpact;
      }, remainingDuration);
    };

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(startImpact);
    });
  }

  function animateCharmListCave(previousRects, options = {}) {
    if (!previousRects || prefersReducedMotion()) return;

    els.charmList.querySelectorAll(".charm-row").forEach((row) => {
      if (String(options.excludeCharmId) === row.dataset.charmId) return;

      const previous = previousRects.get(row.dataset.charmId);
      if (!previous) return;

      const current = row.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (!deltaX && !deltaY) return;

      row.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          delay: options.delay ?? LIST_CAVE_DELAY,
          duration: options.duration ?? LIST_CAVE_DURATION,
          easing: "ease",
          fill: "backwards",
        }
      );
    });
  }

  function favoriteMoveSnapshot(sourceElement, favoriteActive) {
    const sourceRow = sourceElement?.closest(".charm-row");
    if (!sourceRow) return null;

    const clone = sourceRow.cloneNode(true);
    clone.querySelector(".effect-panel")?.remove();
    clone.querySelector(".favorite-button")?.classList.toggle("active", favoriteActive);
    clone.classList.remove("charm-flight-hidden", "charm-return-impact");

    return {
      rect: sourceRow.getBoundingClientRect(),
      clone,
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function animateFavoriteMove(charm, snapshot, previousRects, options = {}) {
    if (!snapshot || prefersReducedMotion()) return Promise.resolve();

    const targetRow = charmListRow(charm.id);
    if (!targetRow) return Promise.resolve();

    const targetRect = targetRow.getBoundingClientRect();
    const deltaX = targetRect.left - snapshot.rect.left;
    const deltaY = targetRect.top - snapshot.rect.top;
    if (!deltaX && !deltaY) return Promise.resolve();

    const clone = snapshot.clone;
    const distance = Math.hypot(deltaX, deltaY);
    const arcAmount = clamp(distance * 0.25, 5, 80);
    const arcX = deltaY < 0 ? arcAmount : -arcAmount;
    const maxDistance = Math.max(window.innerHeight * 0.8, 1);
    const duration = options.duration ?? clamp(100 + (distance / maxDistance) * 300, 100, 400);
    clone.classList.add("charm-row-flyer");
    clone.style.left = `${snapshot.rect.left}px`;
    clone.style.top = `${snapshot.rect.top}px`;
    clone.style.width = `${targetRect.width}px`;
    clone.style.height = `${targetRect.height}px`;
    document.body.append(clone);

    targetRow.classList.add("charm-flight-hidden");
    animateCharmListCave(previousRects, {
      delay: options.caveDelay ?? duration,
      duration: options.caveDuration ?? LIST_CAVE_DURATION,
      excludeCharmId: charm.id,
    });

    const animation = clone.animate(
      [
        {
          offset: 0,
          opacity: 0.96,
          transform: "translate(0, 0)",
        },
        {
          offset: 0.55,
          opacity: 0.94,
          transform: `translate(${deltaX * 0.55 + arcX}px, ${deltaY * 0.55}px)`,
        },
        {
          offset: 1,
          opacity: 0.9,
          transform: `translate(${deltaX}px, ${deltaY}px)`,
        },
      ],
      {
        duration,
        easing: "ease",
        fill: "forwards",
      }
    );

    return animation.finished
      .catch(() => {})
      .finally(() => {
        clone.remove();
        targetRow.classList.remove("charm-flight-hidden");
        triggerCharmReturnImpact(targetRow);
      });
  }

  function prepareOpeningCharmListGap(charm) {
    if (prefersReducedMotion()) return null;

    const row = charmListRow(charm.id);
    const target = row?.querySelector(".charm-pick");
    if (!row || !target) return null;

    const rowRect = row.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (!rowRect.height || !targetRect.width || !targetRect.height) return null;

    row.classList.add("charm-list-gap-opening");
    row.style.height = "0px";
    row.style.minHeight = "0px";
    row.style.overflow = "hidden";

    const animation = row.animate([{ height: "0px" }, { height: `${rowRect.height}px` }], {
      duration: ANIMATION_DURATION,
      easing: "ease",
      fill: "forwards",
    });

    animation.finished
      .catch(() => {})
      .finally(() => {
        row.classList.remove("charm-list-gap-opening");
        row.style.height = "";
        row.style.minHeight = "";
        row.style.overflow = "";
      });

    return { row, target, targetRect };
  }

  function animateCharmFlight(charm, sourceRect, targetRect, arrivalElement, targetElement, options = {}) {
    if (
      !sourceRect ||
      !targetRect ||
      !sourceRect.width ||
      !sourceRect.height ||
      !targetRect.width ||
      !targetRect.height ||
      prefersReducedMotion()
    ) {
      return Promise.resolve();
    }

    const startLeft = sourceRect.left + (sourceRect.width - targetRect.width) / 2;
    const startTop = sourceRect.top + (sourceRect.height - targetRect.height) / 2;
    const deltaX = targetRect.left - startLeft;
    const deltaY = targetRect.top - startTop;
    const flyer = document.createElement("div");

    flyer.className = "charm-flyer";
    if (options.listTarget) flyer.classList.add("charm-flyer-list");
    flyer.style.left = `${startLeft}px`;
    flyer.style.top = `${startTop}px`;
    flyer.style.width = `${targetRect.width}px`;
    flyer.style.height = `${targetRect.height}px`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = charm.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${charm.cost} CP`;

    flyer.append(name, meta);
    document.body.append(flyer);

    arrivalElement?.classList.add("charm-flight-arriving");
    if (options.hideTarget) targetElement?.classList.add("charm-flight-hidden");
    const animation = flyer.animate(
      [
        {
          opacity: 0.95,
          transform: "translate(0, 0)",
        },
        {
          opacity: 0.9,
          transform: `translate(${deltaX}px, ${deltaY}px)`,
        },
      ],
      {
        duration: ANIMATION_DURATION,
        easing: "ease",
        fill: "forwards",
      }
    );

    return animation.finished
      .catch(() => {})
      .finally(() => {
        flyer.remove();
        arrivalElement?.classList.remove("charm-flight-arriving");
        targetElement?.classList.remove("charm-flight-hidden");
      });
  }

  function animateSelectedCharm(charm, sourceRect, slotIndex, options) {
    const targetRow = els.selectionList.children[slotIndex];
    const target = targetRow?.querySelector(".selection-main");
    if (!target) return Promise.resolve();

    return animateCharmFlight(charm, sourceRect, target.getBoundingClientRect(), targetRow, target, options);
  }

  function animateRemovedCharm(charm, sourceRect, options = {}) {
    const targetRow = options.target?.row || charmListRow(charm.id);
    const target = options.target?.target || targetRow?.querySelector(".charm-pick");
    const targetRect = options.target?.targetRect || target?.getBoundingClientRect();
    if (!target) return Promise.resolve();

    return animateCharmFlight(charm, sourceRect, targetRect, targetRow, target, {
      ...options,
      listTarget: true,
    }).then(() => {
      if (options.impact) triggerCharmReturnImpact(targetRow, { skip: options.impactSkip });
    });
  }

  function toggleFavorite(charm, sourceElement, options = {}) {
    const previousRects = charmRowRects();
    const nextFavorite = !state.favorites.has(charm.id);
    const snapshot = favoriteMoveSnapshot(sourceElement, nextFavorite);

    if (!nextFavorite) {
      state.favorites.delete(charm.id);
    } else {
      state.favorites.add(charm.id);
    }
    saveFavorites();
    renderCharms();
    syncFavoritePresetState();
    return animateFavoriteMove(charm, snapshot, previousRects, options);
  }

  function charmIdsForFamilies(families) {
    const familySet = new Set(families);
    return state.charms
      .filter((charm) => familySet.has(charm.family))
      .map((charm) => charm.id);
  }

  function syncFavoritePresetState() {
    els.favoritePresetButtons.forEach((button) => {
      const preset = button.dataset.favoritePreset;
      const ids = charmIdsForFamilies(FAVORITE_PRESETS[preset] || []);
      const active = ids.length > 0 && ids.every((id) => state.favorites.has(id));
      button.classList.toggle("active", active);
    });
  }

  function applyFavoritePreset(preset) {
    const sequence = ++favoritePresetSequence;
    let ids = [];
    let active = false;

    if (preset === "clear") {
      ids = Array.from(state.favorites);
    } else {
      ids = charmIdsForFamilies(FAVORITE_PRESETS[preset] || []);
      active = ids.length > 0 && ids.every((id) => state.favorites.has(id));
      ids = ids.filter((id) => (active ? state.favorites.has(id) : !state.favorites.has(id)));
    }

    const rowOrder = new Map(
      Array.from(els.charmList.querySelectorAll(".charm-row")).map((row, index) => [
        Number(row.dataset.charmId),
        index,
      ])
    );
    const visibleIds = ids
      .filter((id) => rowOrder.has(id))
      .sort((a, b) => rowOrder.get(a) - rowOrder.get(b));
    const hiddenIds = ids.filter((id) => !rowOrder.has(id));

    hiddenIds.forEach((id) => {
      if (preset === "clear" || active) {
        state.favorites.delete(id);
      } else {
        state.favorites.add(id);
      }
    });
    if (hiddenIds.length) {
      saveFavorites();
      syncFavoritePresetState();
    }

    const presetTick =
      visibleIds.length <= 1
        ? 0
        : (FAVORITE_PRESET_TOTAL_DURATION - FAVORITE_PRESET_ITEM_DURATION) / (visibleIds.length - 1);

    visibleIds.forEach((id, index) => {
      window.setTimeout(() => {
        if (sequence !== favoritePresetSequence) return;

        const charm = state.charms[id];
        const favorite = charmListRow(id)?.querySelector(".favorite-button");
        if (charm) {
          toggleFavorite(charm, favorite, {
            duration: FAVORITE_PRESET_ITEM_DURATION,
            caveDelay: 0,
            caveDuration: FAVORITE_PRESET_ITEM_DURATION,
          });
        }
      }, index * presetTick);
    });
  }

  function activeSelections() {
    return state.selections
      .slice(0, state.slots)
      .map((selection, index) => (selection ? { selection, index } : null))
      .filter(Boolean);
  }

  function selectedCharmIds() {
    return new Set(activeSelections().map(({ selection }) => selection.charm.id));
  }

  function selectedFamilySlotMap() {
    return activeSelections().reduce((slots, { selection, index }) => {
      if (!slots.has(selection.charm.family)) slots.set(selection.charm.family, index);
      return slots;
    }, new Map());
  }

  function selectedFamilies() {
    return new Set(activeSelections().map(({ selection }) => selection.charm.family));
  }

  function ensureSlots() {
    while (state.slotPouches.length < state.slots) {
      state.slotPouches.push(POUCHES[0]);
    }
    while (state.selections.length < state.slots) {
      state.selections.push(null);
    }
  }

  function pouchForSlot(index) {
    return state.slotPouches[index] || POUCHES[0];
  }

  function totalCp() {
    return state.selections.slice(0, state.slots).reduce((total, selection, index) => {
      if (!selection) return total;
      return total + selection.charm.cost + pouchForSlot(index).cost;
    }, 0);
  }

  function firstFreeSlot() {
    return state.selections.slice(0, state.slots).findIndex((selection) => !selection);
  }

  function availability(charm) {
    if (!isCompatible(charm)) return { available: false, reason: "wrong item" };
    if (selectedFamilies().has(charm.family)) return { available: false, reason: "family used" };
    const slotIndex = firstFreeSlot();
    if (slotIndex === -1) return { available: false, reason: "no slot" };
    if (totalCp() + charm.cost + pouchForSlot(slotIndex).cost > state.maxCp) {
      return { available: false, reason: "over CP" };
    }
    return { available: true, reason: "" };
  }

  function swapAvailability(charm, slotIndex) {
    const selection = state.selections[slotIndex];
    if (!selection || selection.charm.family !== charm.family) {
      return { available: false, reason: "no counterpart" };
    }
    if (!isCompatible(charm)) return { available: false, reason: "wrong item" };

    const projected = totalCp() - selection.charm.cost + charm.cost;
    if (projected > state.maxCp) return { available: false, reason: "over CP" };

    return { available: true, reason: "" };
  }

  function sortCharms(a, b) {
    return (
      Number(state.favorites.has(b.id)) - Number(state.favorites.has(a.id)) ||
      b.cost - a.cost ||
      a.family.localeCompare(b.family) ||
      a.name.localeCompare(b.name)
    );
  }

  function syncPresetState() {
    els.presetButtons.forEach((button) => {
      const matches =
        Number(button.dataset.slots) === state.slots &&
        Number(button.dataset.cp) === state.maxCp;
      button.classList.toggle("active", matches);
    });
  }

  function syncInputs() {
    els.slotInput.value = state.slots;
    els.cpInput.value = state.maxCp;
    els.itemButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.type === state.itemType);
    });
  }

  function trimSelections() {
    ensureSlots();
    state.selections.forEach((selection, index) => {
      if (selection && !isCompatible(selection.charm)) state.selections[index] = null;
      if (index >= state.slots) state.selections[index] = null;
    });
  }

  function addCharm(charm, sourceElement) {
    if (!availability(charm).available) return;
    const availabilityToken = freezeCharmAvailability();
    const slotIndex = firstFreeSlot();
    const previousCharmRects = charmRowRects();
    const sourceRect = sourceElement?.getBoundingClientRect();

    state.selections[slotIndex] = { charm };
    render();
    animateCharmListCave(previousCharmRects);
    animateSelectedCharm(charm, sourceRect, slotIndex, { hideTarget: true }).finally(() => {
      thawCharmAvailability(availabilityToken);
    });
  }

  function swapCharm(charm, slotIndex, sourceElement) {
    if (!swapAvailability(charm, slotIndex).available) return;

    const availabilityToken = freezeCharmAvailability();
    const previousCharmRects = charmRowRects();
    const previousSelection = state.selections[slotIndex];
    const incomingSourceRect = sourceElement?.getBoundingClientRect();
    const outgoingSourceRect = els.selectionList.children[slotIndex]
      ?.querySelector(".selection-main")
      ?.getBoundingClientRect();

    state.selections[slotIndex] = { charm };
    render();
    animateCharmListCave(previousCharmRects);
    if (prefersReducedMotion()) {
      thawCharmAvailability(availabilityToken);
      return;
    }

    const returningRow = charmListRow(previousSelection.charm.id);
    const returningTarget = returningRow?.querySelector(".charm-pick");
    returningRow?.classList.add("charm-flight-hidden");
    returningTarget?.classList.add("charm-flight-hidden");

    animateSelectedCharm(charm, incomingSourceRect, slotIndex, { hideTarget: true })
      .then(() =>
        animateRemovedCharm(previousSelection.charm, outgoingSourceRect, {
          hideTarget: true,
          impact: true,
          impactSkip: 0.5,
        })
      )
      .finally(() => {
        returningRow?.classList.remove("charm-flight-hidden");
        returningTarget?.classList.remove("charm-flight-hidden");
        thawCharmAvailability(availabilityToken);
      });
  }

  function removeSelection(index, sourceElement) {
    const selection = state.selections[index];
    if (!selection) return;

    const availabilityToken = freezeCharmAvailability();
    const sourceRect = sourceElement?.getBoundingClientRect();
    const charm = selection.charm;

    state.selections[index] = null;
    render();
    const target = prepareOpeningCharmListGap(charm);
    animateRemovedCharm(charm, sourceRect, {
      hideTarget: true,
      impact: true,
      target,
    }).finally(() => {
      thawCharmAvailability(availabilityToken);
    });
  }

  function clearSelectionsInTicks() {
    const sequence = ++clearSelectionSequence;
    const selected = activeSelections();
    const tick = selected.length <= 1 ? 0 : CLEAR_SELECTION_TOTAL_DURATION / (selected.length - 1);

    selected.forEach(({ index }, tickIndex) => {
      window.setTimeout(() => {
        if (sequence !== clearSelectionSequence) return;
        const sourceElement = els.selectionList.children[index]?.querySelector(".selection-main");
        removeSelection(index, sourceElement);
      }, tickIndex * tick);
    });
  }

  function setPouch(index, pouchCost) {
    const pouch = POUCHES.find((candidate) => candidate.cost === pouchCost);
    if (!pouch) return;
    state.slotPouches[index] = pouch;
    render();
  }

  function costLabel(charmCost, pouchCost) {
    return `${charmCost + pouchCost}CP`;
  }

  function numericInputValue(input, fallback, minimum) {
    const cleaned = input.value.replace(/[^\d]/g, "");
    if (input.value !== cleaned) input.value = cleaned;
    return Math.max(minimum, Number(cleaned) || fallback);
  }

  function encodeHash() {
    const count = state.slots;
    const type = state.itemType === "Weapon" ? "0" : "1";
    const pouchCode = Array.from({ length: count }, (_, index) => pouchForSlot(index).cost)
      .reduce((value, cost) => value * 3 + cost, 0)
      .toString(36);
    const charms = Array.from({ length: count }, (_, index) => {
      const selection = state.selections[index];
      return selection ? (selection.charm.id + 1).toString(36).padStart(2, "0") : "00";
    }).join("");

    return [
      count.toString(36),
      state.maxCp.toString(36),
      `${type}${pouchCode}`,
      charms,
    ].join(".");
  }

  function updateHash() {
    if (state.applyingHash || !state.charms.length) return;
    const next = encodeHash();
    if (window.location.hash.slice(1) === next) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${next}`);
  }

  function parseHash() {
    const raw = window.location.hash.slice(1);
    if (!raw || !state.charms.length) return false;

    const parts = raw.split(".");
    if (parts.length !== 4) return false;

    const slots = Number.parseInt(parts[0], 36);
    const maxCp = Number.parseInt(parts[1], 36);
    if (!Number.isFinite(slots) || slots < 1 || !Number.isFinite(maxCp) || maxCp < 0) return false;

    state.slots = slots;
    state.maxCp = maxCp;
    state.itemType = parts[2][0] === "1" ? "Armour/Shield" : "Weapon";
    ensureSlots();

    let pouchValue = Number.parseInt(parts[2].slice(1) || "0", 36);
    for (let index = slots - 1; index >= 0; index -= 1) {
      const pouchCost = pouchValue % 3;
      state.slotPouches[index] = POUCHES.find((pouch) => pouch.cost === pouchCost) || POUCHES[0];
      pouchValue = Math.floor(pouchValue / 3);
    }

    const charmTokens = parts[3] || "";
    for (let index = 0; index < slots; index += 1) {
      const charmToken = charmTokens.slice(index * 2, index * 2 + 2) || "00";
      const charmId = Number.parseInt(charmToken, 36) - 1;
      const charm = state.charms[charmId];
      state.selections[index] = charm ? { charm } : null;
    }

    syncInputs();
    return true;
  }

  function renderSummary() {
    const total = totalCp();
    const remaining = state.maxCp - total;
    const overLimit = remaining < 0;

    els.selectedRemainingCp.innerHTML = `<span>remaining</span> <strong>${remaining}CP</strong>`;
    document.body.classList.toggle("over-limit", overLimit);
    syncPresetState();
  }

  function setCounterpartHighlight(slotIndex, active) {
    const row = els.selectionList.children[slotIndex];
    if (row) row.classList.toggle("counterpart-highlight", active);
  }

  function clearCounterpartHighlights() {
    els.selectionList.querySelectorAll(".counterpart-highlight").forEach((row) => {
      row.classList.remove("counterpart-highlight");
    });
  }

  function renderCharms() {
    clearCounterpartHighlights();
    els.charmList.textContent = "";
    syncFavoritePresetState();

    const selectedIds = selectedCharmIds();
    const familySlots = selectedFamilySlotMap();
    const compatible = state.charms.filter(
      (charm) => isCompatible(charm) && !selectedIds.has(charm.id)
    );
    const visible = compatible.sort(sortCharms);

    if (!visible.length) {
      els.charmList.innerHTML = '<div class="empty">No charms for this item type.</div>';
      return;
    }

    visible.forEach((charm) => {
      const counterpartSlotIndex = familySlots.get(charm.family);
      const isCounterpart = counterpartSlotIndex !== undefined;
      const actualStatus = isCounterpart
        ? swapAvailability(charm, counterpartSlotIndex)
        : availability(charm);
      const status = frozenCharmStatus(charm, actualStatus);
      const row = document.createElement("div");
      row.className = "charm-row";
      row.dataset.charmId = charm.id;
      row.classList.toggle("unavailable", !status.available);
      row.classList.toggle("counterpart-row", isCounterpart);
      applyCharmReturnImpact(row);

      if (isCounterpart) {
        row.addEventListener("pointerenter", () => setCounterpartHighlight(counterpartSlotIndex, true));
        row.addEventListener("pointerleave", () => setCounterpartHighlight(counterpartSlotIndex, false));
        row.addEventListener("focusin", () => setCounterpartHighlight(counterpartSlotIndex, true));
        row.addEventListener("focusout", () => setCounterpartHighlight(counterpartSlotIndex, false));
      }

      const favorite = document.createElement("button");
      favorite.type = "button";
      favorite.className = "favorite-button";
      favorite.classList.toggle("active", state.favorites.has(charm.id));
      favorite.setAttribute("data-empty", "☆");
      favorite.setAttribute("data-filled", "★");
      favorite.setAttribute("aria-label", state.favorites.has(charm.id) ? `Unfavorite ${charm.name}` : `Favorite ${charm.name}`);
      favorite.addEventListener("click", () => toggleFavorite(charm, favorite));

      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "charm-pick";
      choose.disabled = !status.available;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = charm.name;

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${charm.cost} CP`;

      const effect = document.createElement("span");
      effect.className = "effect-panel";
      effect.textContent = charm.effects;

      choose.append(name, meta);
      choose.addEventListener("click", () => {
        if (isCounterpart) {
          swapCharm(charm, counterpartSlotIndex, choose);
        } else {
          addCharm(charm, choose);
        }
      });
      row.append(favorite, choose, effect);
      els.charmList.append(row);
    });

  }

  function renderSelections() {
    els.selectionList.textContent = "";

    for (let index = 0; index < state.slots; index += 1) {
      const selection = state.selections[index];
      const pouch = pouchForSlot(index);
      const row = document.createElement("div");
      row.className = "selection-row";

      const main = document.createElement("div");
      main.className = "selection-main";

      const number = document.createElement("span");
      number.className = "slot-number";
      number.textContent = index + 1;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = selection ? selection.charm.name : "Empty";

      const cost = document.createElement("span");
      cost.className = "meta";
      cost.textContent = costLabel(selection ? selection.charm.cost : 0, pouch.cost);

      main.append(number, name, cost);

      if (selection) {
        const effect = document.createElement("span");
        effect.className = "effect-panel selected-effect-panel";
        effect.textContent = selection.charm.effects;
        row.append(effect);
      }

      const pouchGroup = document.createElement("div");
      pouchGroup.className = "pouch-group";
      pouchGroup.setAttribute("aria-label", selection ? `Pouch for ${selection.charm.name}` : `Pouch for empty slot ${index + 1}`);
      POUCHES.forEach((pouchOption) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = pouchOption.label;
        button.title = pouchOption.name;
        button.classList.toggle("active", pouchOption.cost === pouchForSlot(index).cost);
        const projected = selection ? totalCp() - pouchForSlot(index).cost + pouchOption.cost : totalCp();
        button.disabled = selection && projected > state.maxCp;
        button.addEventListener("click", () => setPouch(index, pouchOption.cost));
        pouchGroup.append(button);
      });

      if (selection) {
        main.addEventListener("click", () => removeSelection(index, main));
      } else {
        row.classList.add("empty-slot");
      }

      row.append(main, pouchGroup);
      els.selectionList.append(row);
    }
  }

  function render() {
    trimSelections();
    renderSummary();
    renderCharms();
    renderSelections();
    updateHash();
  }

  function bindEvents() {
    window.addEventListener("hashchange", () => {
      state.applyingHash = true;
      if (parseHash()) render();
      state.applyingHash = false;
    });

    els.presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.slots = Number(button.dataset.slots);
        state.maxCp = Number(button.dataset.cp);
        els.slotInput.value = state.slots;
        els.cpInput.value = state.maxCp;
        render();
      });
    });

    els.itemButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.itemType = button.dataset.type;
        els.itemButtons.forEach((itemButton) => {
          itemButton.classList.toggle("active", itemButton === button);
        });
        render();
      });
    });

    els.favoritePresetButtons.forEach((button) => {
      button.addEventListener("click", () => applyFavoritePreset(button.dataset.favoritePreset));
    });

    els.slotInput.addEventListener("input", () => {
      state.slots = numericInputValue(els.slotInput, 1, 1);
      render();
    });

    els.cpInput.addEventListener("input", () => {
      state.maxCp = numericInputValue(els.cpInput, 0, 0);
      render();
    });

    els.clearButton.addEventListener("click", () => {
      clearSelectionsInTicks();
    });
  }

  async function init() {
    bindEvents();
    loadFavorites();

    try {
      const response = await fetch("data/charms.json");
      if (!response.ok) throw new Error(`Unable to load charms: ${response.status}`);
      const data = await response.json();
      state.charms = data.map(normalizeCharm);
      state.applyingHash = true;
      parseHash();
      state.applyingHash = false;
      render();
    } catch (error) {
      els.charmList.innerHTML = '<div class="empty">Could not load data/charms.json.</div>';
      console.error(error);
    }
  }

  init();
})();
