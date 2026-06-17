(function () {
  const POUCHES = [
    { name: "Silk Pouch", cost: 0 },
    { name: "Kevlar Pouch", cost: 1 },
    { name: "Mithril Pouch", cost: 2 },
  ];

  const state = {
    charms: [],
    selections: Array.from({ length: 7 }, () => null),
    slotPouches: Array.from({ length: 7 }, () => POUCHES[0]),
    slots: 7,
    maxCp: 100,
    itemType: "Weapon",
  };

  const els = {
    remainingCp: document.getElementById("remainingCp"),
    selectedRemainingCp: document.getElementById("selectedRemainingCp"),
    slotInput: document.getElementById("slotInput"),
    cpInput: document.getElementById("cpInput"),
    clearButton: document.getElementById("clearButton"),
    charmList: document.getElementById("charmList"),
    selectionList: document.getElementById("selectionList"),
    presetButtons: Array.from(document.querySelectorAll(".preset")),
    itemButtons: Array.from(document.querySelectorAll(".item-toggle")),
  };

  function charmFamily(name) {
    return name
      .replace(/^(Lesser|Greater)\s+/i, "")
      .replace(/\s+Charm$/i, "")
      .trim()
      .toLowerCase();
  }

  function normalizeCharm(raw) {
    return {
      name: raw.charm,
      cost: Number(raw.charmPointCost),
      effects: raw.effects,
      materials: raw.materialCosts,
      slot: raw.slot,
      family: charmFamily(raw.charm),
    };
  }

  function isCompatible(charm) {
    return charm.slot === "All" || charm.slot === state.itemType;
  }

  function selectedFamilies() {
    return new Set(
      state.selections
        .slice(0, state.slots)
        .filter(Boolean)
        .map((selection) => selection.charm.family)
    );
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

  function sortCharms(a, b) {
    const aState = availability(a);
    const bState = availability(b);
    return (
      Number(bState.available) - Number(aState.available) ||
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

  function trimSelections() {
    ensureSlots();
    state.selections.forEach((selection, index) => {
      if (selection && !isCompatible(selection.charm)) state.selections[index] = null;
      if (index >= state.slots) state.selections[index] = null;
    });
  }

  function addCharm(charm) {
    if (!availability(charm).available) return;
    state.selections[firstFreeSlot()] = { charm };
    render();
  }

  function removeSelection(index) {
    state.selections[index] = null;
    render();
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

  function renderSummary() {
    const total = totalCp();
    const remaining = state.maxCp - total;
    const overLimit = remaining < 0;

    els.remainingCp.textContent = `${remaining} CP left`;
    els.selectedRemainingCp.innerHTML = `<span>remaining</span> <strong>${remaining}CP</strong>`;
    document.body.classList.toggle("over-limit", overLimit);
    syncPresetState();
  }

  function renderCharms() {
    els.charmList.textContent = "";

    const visible = state.charms.filter(isCompatible).sort(sortCharms);
    if (!visible.length) {
      els.charmList.innerHTML = '<div class="empty">No charms for this item type.</div>';
      return;
    }

    visible.forEach((charm) => {
      const status = availability(charm);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "charm-row";
      row.disabled = !status.available;
      row.title = `${charm.effects}\n${charm.materials}`;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = charm.name;

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `${charm.cost} CP`;

      row.append(name, meta);
      row.addEventListener("click", () => addCharm(charm));
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
      if (selection) name.title = `${selection.charm.effects}\n${selection.charm.materials}`;

      const cost = document.createElement("span");
      cost.className = "meta";
      cost.textContent = costLabel(selection ? selection.charm.cost : 0, pouch.cost);

      main.append(number, name, cost);

      const pouchGroup = document.createElement("div");
      pouchGroup.className = "pouch-group";
      pouchGroup.setAttribute("aria-label", selection ? `Pouch for ${selection.charm.name}` : `Pouch for empty slot ${index + 1}`);
      POUCHES.forEach((pouchOption) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = pouchOption.cost;
        button.title = pouchOption.name;
        button.classList.toggle("active", pouchOption.cost === pouchForSlot(index).cost);
        const projected = selection ? totalCp() - pouchForSlot(index).cost + pouchOption.cost : totalCp();
        button.disabled = selection && projected > state.maxCp;
        button.addEventListener("click", () => setPouch(index, pouchOption.cost));
        pouchGroup.append(button);
      });

      if (selection) {
        row.title = "Click the charm name to remove it.";
        main.addEventListener("click", () => removeSelection(index));
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
  }

  function bindEvents() {
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

    els.slotInput.addEventListener("input", () => {
      state.slots = numericInputValue(els.slotInput, 1, 1);
      render();
    });

    els.cpInput.addEventListener("input", () => {
      state.maxCp = numericInputValue(els.cpInput, 0, 0);
      render();
    });

    els.clearButton.addEventListener("click", () => {
      state.selections = state.selections.map(() => null);
      render();
    });
  }

  async function init() {
    bindEvents();

    try {
      const response = await fetch("data/charms.json");
      if (!response.ok) throw new Error(`Unable to load charms: ${response.status}`);
      const data = await response.json();
      state.charms = data.map(normalizeCharm);
      render();
    } catch (error) {
      els.charmList.innerHTML = '<div class="empty">Could not load data/charms.json.</div>';
      console.error(error);
    }
  }

  init();
})();
