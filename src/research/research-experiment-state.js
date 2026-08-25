(function initResearchExperimentState(global) {
  'use strict';
  const app = global.PanmapApp = global.PanmapApp || {};
  function create(options = {}) {
    const selector = options.selector || app.densitySelector;
    const registry = options.registry || app.researchLayoutRegistry;
    const eligible = options.eligible || [];
    let token = 0;
    let lastPreset = 'standard';
    let state = {
      layoutPreference: 'balanced', densityPreset: 'standard', customRingQuotas: null,
      fullLoadStressTest: false, seedLocked: true, showUnplacedReasons: false,
      selectionRevision: 0, layoutRevision: 0, evaluationRevision: 0,
      status: 'idle', stage: 'ready', selection: selector.select(eligible,{presetId:'standard'}),
      layout: null, evaluation: null, error: null,
    };
    const listeners = new Set();
    const emit = () => listeners.forEach((listener) => listener(getState()));
    const getState = () => ({ ...state, customRingQuotas: state.customRingQuotas ? { ...state.customRingQuotas } : null });
    function setAlgorithm(layoutPreference) { if (!registry.get(layoutPreference)) throw new RangeError('unknown research layout'); state={...state,layoutPreference,error:null};emit(); }
    function selectDensity(densityPreset) { if (!app.densityPresets.PRESETS[densityPreset] || densityPreset==='full') throw new RangeError('unknown visible density preset');lastPreset=densityPreset;const selection=selector.select(eligible,{presetId:densityPreset});state={...state,densityPreset,customRingQuotas:null,fullLoadStressTest:false,selection,selectionRevision:state.selectionRevision+1,error:null};emit(); }
    function setCustomQuotas(customRingQuotas) { const selection=selector.select(eligible,{presetId:lastPreset,customRingQuotas});state={...state,densityPreset:'custom',customRingQuotas:{...customRingQuotas},fullLoadStressTest:false,selection,selectionRevision:state.selectionRevision+1,error:null};emit(); }
    function setFullLoad(enabled) { const selection=selector.select(eligible,{presetId:enabled?'full':lastPreset});state={...state,densityPreset:enabled?'full':lastPreset,customRingQuotas:null,fullLoadStressTest:Boolean(enabled),selection,selectionRevision:state.selectionRevision+1,error:null};emit(); }
    function setOption(key,value){if(!['seedLocked','showUnplacedReasons'].includes(key))throw new RangeError('unknown research option');state={...state,[key]:Boolean(value)};emit();}
    async function run(runOptions={}) { const jobToken=++token;state={...state,status:'running',stage:'选择标签',error:null};emit();await Promise.resolve();if(jobToken!==token)return{cancelled:true};state={...state,stage:'生成候选'};emit();await Promise.resolve();const layout=registry.run(state.layoutPreference,state.selection.selected,runOptions.layoutConfig||{});if(jobToken!==token)return{cancelled:true};state={...state,stage:'放置'};emit();await Promise.resolve();if(jobToken!==token)return{cancelled:true};state={...state,stage:'生成包络'};emit();await Promise.resolve();if(jobToken!==token)return{cancelled:true};state={...state,stage:'评估'};emit();const evaluation=runOptions.evaluate?runOptions.evaluate(layout):null;if(jobToken!==token)return{cancelled:true};state={...state,status:'complete',stage:'完成',layout,evaluation,layoutRevision:state.layoutRevision+1,evaluationRevision:state.evaluationRevision+Number(Boolean(evaluation)),error:null};emit();return{cancelled:false,layout,evaluation,selection:state.selection}; }
    function cancel(){token+=1;if(state.status==='running'){state={...state,status:'cancelled',stage:'已取消'};emit();}}
    function fail(error){state={...state,status:'error',stage:'失败',error:{message:error?.message||String(error)}};emit();}
    function subscribe(listener){listeners.add(listener);listener(getState());return()=>listeners.delete(listener);}
    return Object.freeze({getState,subscribe,setAlgorithm,selectDensity,setCustomQuotas,setFullLoad,setOption,run,cancel,fail});
  }
  app.researchExperimentState=Object.freeze({VERSION:'stage43-research-state-v1',create});
})(typeof window==='undefined'?globalThis:window);
