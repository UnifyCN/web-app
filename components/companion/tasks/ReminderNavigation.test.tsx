// @vitest-environment jsdom
// Real drawer selection, with account-owned read fixtures and a rendered task marker.
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {I18nextProvider} from 'react-i18next';
import {testI18n} from './taskActionsTestHarness';
import {taskProgressFor} from '@/lib/companionActions/contract';
import {TaskActionsDrawer} from './TaskActionsDrawer';
const f=vi.hoisted(()=>({items:[] as unknown[],tasks:[] as unknown[],owner:{accountId:'a',epoch:0}}));
vi.mock('@/hooks/useAccountId',()=>({useAccountGeneration:()=>f.owner.epoch}));
vi.mock('@/hooks/useChecklist',()=>({useTasks:()=>({data:f.tasks,isLoading:false})}));
vi.mock('@/hooks/useTaskActions',()=>({
 useTaskProgress:()=>({status:'ready',stale:false,canWrite:true,refetch:()=>{},byRef:new Map(),stepsByRef:new Map(),details:[],reminders:{items:f.items,scheduler:'ready'}}),
 useTaskActionStore:()=>null,useTaskActionClient:()=>({owner:f.owner}),useTaskActionPhase:()=>({phase:'idle'}),useStepProposal:()=>({}),
}));
vi.mock('./TaskStatePanel',()=>({TaskStatePanel:({taskRef,title}:{taskRef:string;title:string})=><div data-testid="task-target">{taskRef} {title}</div>,progressFor:taskProgressFor}));
vi.mock('./TaskDrawer',()=>({TaskDrawer:({open,children}:{open:boolean;children:React.ReactNode})=>open?<div role="dialog">{children}</div>:null}));
vi.mock('./TaskProposalPanel',()=>({TaskProposalPanel:()=>null}));
vi.mock('./StepProposalPanel',()=>({StepProposalPanel:()=>null}));
vi.mock('./SavedDetails',()=>({SavedDetailsPanel:()=>null,DetailProposalPanel:()=>null}));
vi.mock('../plans/PlanPanel',()=>({PlanPanel:()=>null}));
beforeEach(()=>{f.owner={accountId:'a',epoch:0};f.tasks=[{id:'1',title:'Custom with same number',isCustom:true,completed:false,dismissedAt:null}];f.items=[{reminderId:'r',taskRef:'sanity:1',title:'Content target',remindAt:'2027-11-07T05:30:00Z',timeZone:'America/New_York',wallTime:'2027-11-07T01:30:00',revision:1,status:'pending',due:true,dueAt:'2027-11-07T05:30:01Z',cancelledReason:null,history:[]}];});
afterEach(()=>cleanup());
const element=(initialTask?:{taskRef:string;title:string})=><I18nextProvider i18n={testI18n()}><TaskActionsDrawer open onClose={()=>{}} surface="companion" initialTask={initialTask}/></I18nextProvider>;
it('opens a reminder target with no progress row and preserves its source when numeric ids collide',()=>{render(element({taskRef:'sanity:1',title:'Content target'}));expect(screen.getByTestId('task-target').textContent).toBe('sanity:1 Content target');});
it('opens the due reminder from the list and clears the private target after account change',()=>{const mounted=render(element());fireEvent.click(screen.getByRole('button',{name:'Open task'}));expect(screen.getByTestId('task-target').textContent).toBe('sanity:1 Content target');f.owner={accountId:'b',epoch:1};f.items=[];f.tasks=[];mounted.rerender(element());expect(screen.queryByTestId('task-target')).toBeNull();expect(screen.queryByText('Content target')).toBeNull();});
