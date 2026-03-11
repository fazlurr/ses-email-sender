import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { 
  Mail, 
  Upload, 
  Send, 
  Settings as SettingsIcon, 
  Users, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff,
  Trash2,
  ChevronRight,
  ShieldCheck,
  Globe,
  LayoutDashboard,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Recipient {
  email: string;
  name: string;
  status: 'pending' | 'sending' | 'success' | 'error';
  error?: string;
}

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-3',
  'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  'ca-central-1', 'eu-central-1', 'eu-west-1', 'eu-west-2',
  'eu-south-1', 'eu-west-3', 'eu-north-1', 'me-south-1',
  'sa-east-1', 'us-gov-east-1', 'us-gov-west-1'
];

type View = 'campaign' | 'settings';

export default function App() {
  const [activeView, setActiveView] = useState<View>('campaign');

  // AWS Credentials
  const [awsKey, setAwsKey] = useState('');
  const [awsSecret, setAwsSecret] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [showSecret, setShowSecret] = useState(false);

  // Sender Info
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');

  // Email Content
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Recipients
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Campaign State
  const [isSending, setIsSending] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info' | 'success' | 'error' }[]>([]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev].slice(0, 50));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Strictly looking for 'name' and 'email' columns as requested
        const parsed: Recipient[] = data.map(row => ({
          email: String(row.email || row.Email || row.EMAIL || '').trim(),
          name: String(row.name || row.Name || row.NAME || 'Recipient').trim(),
          status: 'pending' as const
        })).filter(r => r.email && r.email.includes('@'));

        setRecipients(parsed);
        addLog(`Loaded ${parsed.length} recipients from ${file.name}`, 'success');
      } catch (err) {
        addLog('Error parsing Excel file', 'error');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const sendEmail = async (recipient: Recipient, index: number) => {
    setRecipients(prev => prev.map((r, i) => i === index ? { ...r, status: 'sending' } : r));
    
    // Variable replacement logic
    const personalize = (text: string) => {
      return text
        .replace(/\{\{\s*name\s*\}\}/gi, recipient.name)
        .replace(/\{\{\s*email\s*\}\}/gi, recipient.email);
    };

    const personalizedSubject = personalize(subject);
    const personalizedBody = personalize(body);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials: { accessKeyId: awsKey, secretAccessKey: awsSecret, region },
          sender: { name: senderName, email: senderEmail },
          recipient: { email: recipient.email, name: recipient.name },
          content: { subject: personalizedSubject, body: personalizedBody }
        })
      });

      const result = await response.json();
      if (response.ok) {
        setRecipients(prev => prev.map((r, i) => i === index ? { ...r, status: 'success' } : r));
        addLog(`Sent to ${recipient.email}`, 'success');
      } else {
        throw new Error(result.error || 'Failed to send');
      }
    } catch (err: any) {
      setRecipients(prev => prev.map((r, i) => i === index ? { ...r, status: 'error', error: err.message } : r));
      addLog(`Failed for ${recipient.email}: ${err.message}`, 'error');
    }
  };

  const startCampaign = async () => {
    if (!awsKey || !awsSecret || !senderEmail || !subject || !body || recipients.length === 0) {
      addLog('Please check credentials, sender info, content, and recipients', 'error');
      if (!awsKey || !awsSecret) setActiveView('settings');
      return;
    }

    setIsSending(true);
    addLog('Starting high-speed email campaign (Throttled to 100/sec)...', 'info');

    const DELAY_BETWEEN_EMAILS = 10; // 100 emails per second = 10ms per email

    for (let i = 0; i < recipients.length; i++) {
      if (recipients[i].status === 'success') continue;
      
      setCurrentIndex(i);
      await sendEmail(recipients[i], i);
      
      if (i < recipients.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_EMAILS));
      }
    }

    setIsSending(false);
    setCurrentIndex(-1);
    addLog('Campaign completed', 'info');
  };

  const stats = useMemo(() => {
    const total = recipients.length;
    const success = recipients.filter(r => r.status === 'success').length;
    const error = recipients.filter(r => r.status === 'error').length;
    const pending = recipients.filter(r => r.status === 'pending').length;
    const progress = total > 0 ? Math.round(((success + error) / total) * 100) : 0;
    return { total, success, error, pending, progress };
  }, [recipients]);

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link', 'image', 'code-block'],
      ['clean']
    ],
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-[#0F172A] border-r border-white/5 flex flex-col h-screen text-slate-300">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Mail size={18} />
          </div>
          <span className="font-bold text-white tracking-tight text-lg">BlastFlow</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Navigation</div>
          
          <button 
            onClick={() => setActiveView('campaign')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              activeView === 'campaign' ? "bg-indigo-500 text-white" : "hover:bg-white/5 text-slate-400"
            )}
          >
            <LayoutDashboard size={18} />
            Campaign
          </button>

          <button 
            onClick={() => setActiveView('settings')}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              activeView === 'settings' ? "bg-indigo-500 text-white" : "hover:bg-white/5 text-slate-400"
            )}
          >
            <SettingsIcon size={18} />
            AWS Settings
          </button>

          <div className="mt-8 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Quick Stats</div>
          <div className="px-3 py-4 space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Progress</span>
                <span>{stats.progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-500" 
                  style={{ width: `${stats.progress}%` }} 
                />
              </div>
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="bg-indigo-500/10 rounded-xl p-4 border border-indigo-500/20">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Status</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isSending ? "Campaign in progress..." : "System ready for blast."}
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
              {activeView === 'campaign' ? 'Email Campaign' : 'AWS Configuration'}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {activeView === 'campaign' && (
              <button 
                onClick={startCampaign}
                disabled={isSending || recipients.length === 0}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-xs transition-all",
                  isSending 
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 active:scale-95"
                )}
              >
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isSending ? "Sending..." : "Launch Campaign"}
              </button>
            )}
          </div>
        </header>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeView === 'campaign' ? (
              <motion.div 
                key="campaign"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'Total Recipients', value: stats.total, icon: Users, color: 'text-slate-600', bg: 'bg-slate-100' },
                    { label: 'Successfully Sent', value: stats.success, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Failed Deliveries', value: stats.error, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
                    { label: 'Pending Queue', value: stats.pending, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className={cn("p-2 rounded-lg", stat.bg)}>
                          <stat.icon size={20} className={stat.color} />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-2xl font-bold tracking-tight text-slate-900">{stat.value}</span>
                        <span className="text-xs font-medium text-slate-500 mt-1">{stat.label}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  <div className="xl:col-span-2 space-y-8">
                    {/* Setup Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 text-sm">Campaign Details</h3>
                      </div>
                      
                      <div className="p-6 space-y-8">
                        {/* Upload Area */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700">Recipient List (Excel)</label>
                            <span className="text-[10px] text-slate-400 uppercase font-bold">Required: 'name' & 'email' columns</span>
                          </div>
                          <div 
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                              "group border-2 border-dashed border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all",
                              isUploading && "opacity-50 pointer-events-none"
                            )}
                          >
                            <input 
                              type="file" 
                              ref={fileInputRef} 
                              onChange={handleFileUpload} 
                              accept=".xlsx,.xls,.csv" 
                              className="hidden" 
                            />
                            <Upload size={24} className="text-slate-400 group-hover:text-indigo-600 mb-3" />
                            <p className="text-sm font-semibold text-slate-700">Upload Recipients</p>
                            <p className="text-xs text-slate-400 mt-1">Select an Excel file with 'name' and 'email' columns</p>
                          </div>
                        </div>

                        {/* Content Area */}
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-700">Subject Line</label>
                            <input 
                              type="text"
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              placeholder="Enter subject..."
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-700">Email Content</label>
                              <div className="flex gap-2">
                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{"{{ name }}"}</span>
                                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-mono">{"{{ email }}"}</span>
                              </div>
                            </div>
                            <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
                              <ReactQuill 
                                theme="snow" 
                                value={body} 
                                onChange={setBody} 
                                modules={quillModules}
                                className="bg-white h-80"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {/* Queue Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
                      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="font-bold text-slate-800 text-sm">Recipient Queue</h3>
                        <button onClick={() => setRecipients([])} className="text-xs font-bold text-rose-600 disabled:opacity-30">Clear</button>
                      </div>
                      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {recipients.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-20">
                            <Users size={32} className="mb-2" />
                            <p className="text-xs font-medium">No recipients</p>
                          </div>
                        ) : (
                          recipients.map((r, i) => (
                            <div key={i} className={cn(
                              "px-6 py-4 flex items-center justify-between",
                              i === currentIndex && "bg-indigo-50/50 border-l-2 border-indigo-500"
                            )}>
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-700 truncate">{r.name}</span>
                                <span className="text-[10px] text-slate-400 font-mono truncate">{r.email}</span>
                              </div>
                              <div className="flex-shrink-0 ml-4">
                                {r.status === 'sending' && <Loader2 size={14} className="animate-spin text-indigo-500" />}
                                {r.status === 'success' && <CheckCircle2 size={14} className="text-emerald-500" />}
                                {r.status === 'error' && <AlertCircle size={14} className="text-rose-500" />}
                                {r.status === 'pending' && <div className="w-3 h-3 rounded-full border border-slate-200" />}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Logs Card */}
                    <div className="bg-[#0F172A] rounded-2xl shadow-xl overflow-hidden flex flex-col h-[300px]">
                      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Activity Log</span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-2">
                        {logs.map((log, i) => (
                          <div key={i} className="flex gap-3 leading-relaxed">
                            <span className="text-slate-600 flex-shrink-0">[{log.time}]</span>
                            <span className={cn(
                              log.type === 'success' && "text-emerald-400",
                              log.type === 'error' && "text-rose-400",
                              log.type === 'info' && "text-indigo-400"
                            )}>{log.msg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-800">AWS SES Configuration</h3>
                    <p className="text-xs text-slate-500 mt-1">Configure your Amazon SES credentials and region.</p>
                  </div>
                  
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700">AWS Region</label>
                        <div className="relative">
                          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <select 
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none"
                          >
                            {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700">Access Key ID</label>
                        <input 
                          type="text"
                          value={awsKey}
                          onChange={(e) => setAwsKey(e.target.value)}
                          placeholder="AKIA..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-700">Secret Access Key</label>
                      <div className="relative">
                        <input 
                          type={showSecret ? "text" : "password"}
                          value={awsSecret}
                          onChange={(e) => setAwsSecret(e.target.value)}
                          placeholder="Enter secret key..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono pr-12"
                        />
                        <button 
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="h-[1px] bg-slate-100 my-4" />

                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Sender Profile</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-700">Sender Name</label>
                          <input 
                            type="text"
                            value={senderName}
                            onChange={(e) => setSenderName(e.target.value)}
                            placeholder="e.g. BlastFlow Team"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-700">Sender Email</label>
                          <input 
                            type="email"
                            value={senderEmail}
                            onChange={(e) => setSenderEmail(e.target.value)}
                            placeholder="verified@example.com"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:ring-2 ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed italic">
                        Important: The sender email must be a verified identity in your Amazon SES console.
                      </p>
                    </div>

                    <div className="pt-4">
                      <button 
                        onClick={() => setActiveView('campaign')}
                        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                      >
                        Save & Return to Campaign
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
                  <div className="p-2 bg-amber-100 rounded-lg h-fit">
                    <AlertCircle size={20} className="text-amber-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-amber-900">Sandbox Mode Notice</h4>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      If your AWS SES account is in sandbox mode, you can only send emails to verified addresses. 
                      Request production access in the AWS console to send to anyone.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
