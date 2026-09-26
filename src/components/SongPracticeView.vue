<script setup>
import { ref, shallowRef, onMounted, onUnmounted, watch } from 'vue';
import { useSongsStore } from '../stores/songs.js';
import { validateSong, transposeAbc, loadAbcjs } from '../music/abc.js';
import SongSession from './SongSession.vue';

const songs = useSongsStore();

/** 'list' browses the library; 'edit' is the add/edit form; 'practice' is
 *  an actual play-along session (see SongSession.vue). */
const mode = ref('list');
const practicingSong = shallowRef(null);
const editingId = ref(null);
const title = ref('');
const abc = ref('');

/** null while the textarea is empty; otherwise the last validateSong() result. */
const validation = shallowRef(null);
const validating = ref(false);
let validateTimer = null;
let validationToken = 0;

const confirmingDeleteId = ref(null);
let confirmTimer = null;

const importError = ref('');
const importMessage = ref('');
const fileInput = ref(null);

// Kicks off the abcjs download as soon as this screen opens, rather than
// waiting for the first keystroke in the editor to need it.
onMounted(() => { loadAbcjs(); });

watch(abc, () => {
  clearTimeout(validateTimer);
  if (!abc.value.trim()) {
    validation.value = null;
    validating.value = false;
    return;
  }
  validating.value = true;
  validateTimer = setTimeout(runValidation, 250);
});

async function runValidation() {
  const token = (validationToken += 1);
  const result = await validateSong(abc.value);
  if (token !== validationToken) return; // a newer edit has already superseded this one
  validation.value = result;
  validating.value = false;
}

function startAdd() {
  editingId.value = null;
  title.value = '';
  abc.value = '';
  validation.value = null;
  mode.value = 'edit';
}

function startEdit(song) {
  editingId.value = song.id;
  title.value = song.title;
  abc.value = song.abc;
  mode.value = 'edit';
  runValidation();
}

function startPractice(song) {
  practicingSong.value = song;
  mode.value = 'practice';
}

function backToLibrary() {
  practicingSong.value = null;
  mode.value = 'list';
}

function cancel() {
  clearTimeout(validateTimer);
  mode.value = 'list';
}

function save() {
  if (!validation.value?.valid) return;
  const fields = { title: title.value, abc: abc.value };
  if (editingId.value) songs.update(editingId.value, fields);
  else songs.add(fields);
  mode.value = 'list';
}

async function acceptTransposition() {
  const semitones = validation.value?.transposition?.semitones;
  if (semitones === undefined) return;
  abc.value = await transposeAbc(abc.value, semitones);
  await runValidation();
}

/** Delete needs a second click within a few seconds, to catch a misclick
 *  without the friction of a native confirm() dialog. */
function requestDelete(song) {
  clearTimeout(confirmTimer);
  if (confirmingDeleteId.value === song.id) {
    songs.remove(song.id);
    confirmingDeleteId.value = null;
    return;
  }
  confirmingDeleteId.value = song.id;
  confirmTimer = setTimeout(() => { confirmingDeleteId.value = null; }, 4000);
}

function exportLibrary() {
  const blob = new Blob([songs.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ocarina-songs.json';
  a.click();
  URL.revokeObjectURL(url);
}

function pickImportFile() {
  importError.value = '';
  importMessage.value = '';
  fileInput.value?.click();
}

function onImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = ''; // so picking the same file again still fires 'change'
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const count = songs.importJson(String(reader.result));
      importError.value = '';
      importMessage.value = `Imported ${count} song${count === 1 ? '' : 's'}.`;
    } catch (err) {
      importMessage.value = '';
      importError.value = err.message || 'Could not import that file.';
    }
  };
  reader.onerror = () => { importError.value = 'Could not read that file.'; };
  reader.readAsText(file);
}

function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

onUnmounted(() => {
  clearTimeout(validateTimer);
  clearTimeout(confirmTimer);
});
</script>

<template>
  <section class="songs">
    <template v-if="mode === 'list'">
      <p class="blurb">
        Songs are stored in this browser only — there's no account and nothing syncs.
        Clearing site data loses them, so export a backup now and then.
      </p>

      <div class="library-actions">
        <button class="primary" @click="startAdd">Add a song</button>
        <button @click="exportLibrary">Export library</button>
        <button @click="pickImportFile">Import library</button>
        <input ref="fileInput" type="file" accept="application/json" class="visually-hidden" @change="onImportFile" />
      </div>
      <p v-if="importMessage" class="import-status ok">{{ importMessage }}</p>
      <p v-if="importError" class="import-status error">{{ importError }}</p>

      <p v-if="songs.songs.length === 0" class="empty">
        Your library is empty. Add a song to get started.
      </p>
      <ul v-else class="song-list">
        <li v-for="song in songs.songs" :key="song.id" class="song-row">
          <div class="song-info">
            <p class="song-title">{{ song.title }}</p>
            <p class="song-date">Added {{ formatDate(song.addedAt) }}</p>
          </div>
          <div class="song-actions">
            <button class="primary" @click="startPractice(song)">Practise</button>
            <button @click="startEdit(song)">Edit</button>
            <button
              class="danger"
              :class="{ confirming: confirmingDeleteId === song.id }"
              @click="requestDelete(song)"
            >{{ confirmingDeleteId === song.id ? 'Really delete?' : 'Delete' }}</button>
          </div>
        </li>
      </ul>
    </template>

    <SongSession v-else-if="mode === 'practice'" :song="practicingSong" @back="backToLibrary" />

    <template v-else>
      <div class="field">
        <label for="song-title">Title</label>
        <input id="song-title" v-model="title" type="text" placeholder="Untitled" />
      </div>

      <div class="field">
        <label for="song-abc">ABC notation</label>
        <textarea
          id="song-abc" v-model="abc" rows="10" spellcheck="false"
          placeholder="X:1&#10;T:Title&#10;M:4/4&#10;L:1/4&#10;K:C&#10;C D E F | G A B c |]"
        />
      </div>

      <div class="validation" :class="{ pending: validating }">
        <p v-if="!abc.trim()" class="hint">Paste or type an ABC tune above.</p>
        <p v-else-if="validating" class="hint">Checking…</p>
        <template v-else-if="validation">
          <p v-if="validation.valid" class="status ok">
            Looks good{{ validation.title ? ` — “${validation.title}”` : '' }}.
            <span v-if="validation.meter"> {{ validation.meter.num }}/{{ validation.meter.den }} time.</span>
            <span v-if="validation.bpm"> {{ validation.bpm }} BPM.</span>
          </p>
          <p v-else class="status error">This tune can't be played yet:</p>

          <p v-if="validation.needsAccidentals" class="hint">
            This tune needs semitones — some notes aren't naturals.
          </p>

          <ul v-if="validation.issues.length > 0" class="issues">
            <li v-for="(issue, i) in validation.issues" :key="i" :class="issue.severity">
              {{ issue.message }}
              <ul v-if="issue.notes" class="issue-notes">
                <li v-for="(n, j) in issue.notes" :key="j">
                  Bar {{ n.bar }}: {{ n.name }}
                  <span v-if="n.semitonesOver">, {{ n.semitonesOver }} semitone{{ n.semitonesOver === 1 ? '' : 's' }} above the top note</span>
                  <span v-if="n.semitonesUnder">, {{ n.semitonesUnder }} semitone{{ n.semitonesUnder === 1 ? '' : 's' }} below the bottom note</span>
                </li>
              </ul>
            </li>
          </ul>

          <button v-if="validation.transposition" class="transpose" @click="acceptTransposition">
            Transpose {{ Math.abs(validation.transposition.semitones) }}
            semitone{{ Math.abs(validation.transposition.semitones) === 1 ? '' : 's' }}
            {{ validation.transposition.direction }} to fit
          </button>
        </template>
      </div>

      <div class="actions">
        <button class="primary" :disabled="!validation?.valid" @click="save">Save</button>
        <button @click="cancel">Cancel</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.songs { display: flex; flex-direction: column; gap: 1rem; }

.blurb { margin: 0; color: var(--ink-dim); font-size: 0.85rem; line-height: 1.5; }

.library-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

.import-status { margin: 0; font-size: 0.8rem; }
.import-status.ok { color: var(--accent-ok); }
.import-status.error { color: var(--accent-warn); }

.empty { margin: 0; color: var(--ink-faint); font-size: 0.85rem; text-align: center; padding: 1.5rem 0; }

.song-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.song-row {
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.7rem 0.85rem; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2);
}
.song-info { min-width: 0; }
.song-title { margin: 0; font-size: 0.9rem; font-weight: 600; color: var(--ink); }
.song-date { margin: 0.15rem 0 0; font-size: 0.75rem; color: var(--ink-faint); }
.song-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

button {
  font: inherit; font-size: 0.85rem; padding: 0.55rem 0.9rem; cursor: pointer;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink);
  border-radius: 8px;
}
button.primary {
  background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600;
}
button:disabled { opacity: 0.6; cursor: default; }
button.danger { color: var(--accent-warn); }
button.danger.confirming { background: var(--accent-warn); border-color: var(--accent-warn); color: var(--on-accent); }

.field { display: flex; flex-direction: column; gap: 0.35rem; }
.field label { font-size: 0.85rem; color: var(--ink-dim); }
.field input[type='text'] {
  font: inherit; font-size: 0.9rem; padding: 0.55rem 0.7rem;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px;
}
.field textarea {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.82rem; line-height: 1.5;
  padding: 0.65rem 0.75rem; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink);
  border-radius: 8px; resize: vertical;
}

.validation { font-size: 0.82rem; }
.hint { margin: 0 0 0.4rem; color: var(--ink-faint); }
.status { margin: 0 0 0.4rem; font-weight: 600; }
.status.ok { color: var(--accent-ok); }
.status.error { color: var(--accent-warn); }

.issues { list-style: none; margin: 0 0 0.6rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.issues > li { padding-left: 0.9rem; border-left: 3px solid var(--line); }
.issues > li.error { border-left-color: var(--accent-warn); color: var(--ink); }
.issues > li.warning { border-left-color: var(--ink-faint); color: var(--ink-dim); }
.issue-notes { margin: 0.25rem 0 0; padding-left: 1.1rem; font-size: 0.78rem; color: var(--ink-dim); }

.transpose {
  background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600;
}

.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
</style>
