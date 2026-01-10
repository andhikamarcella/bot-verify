'use client';

import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useEffect, useRef, useState } from 'react';

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
  onAgree: () => void;
  agreeText: string;
  readToEndText: string;
}

export function PolicyModal({ isOpen, onClose, title, content, onAgree, agreeText, readToEndText }: PolicyModalProps) {
  const [canAgree, setCanAgree] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCanAgree(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const node = contentRef.current;
    if (!node) return;
    const check = () => {
      const { scrollHeight, clientHeight } = node;
      if (scrollHeight <= clientHeight + 4) {
        setCanAgree(true);
      }
    };
    requestAnimationFrame(check);
  }, [content, isOpen]);

  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      if (scrollHeight <= clientHeight + 4) {
        setCanAgree(true);
        return;
      }
      if (scrollTop + clientHeight >= scrollHeight - 50) { // Tolerance
        setCanAgree(true);
      }
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl max-h-[85vh] flex flex-col transform overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-white mb-4"
                >
                  {title}
                </Dialog.Title>
                <div 
                    ref={contentRef}
                    onScroll={handleScroll}
                    className="mt-2 flex-1 min-h-0 overflow-y-auto pr-2 text-slate-300 text-sm space-y-4 border-b border-slate-700 pb-2"
                >
                  {content}
                </div>

                <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <p className={`text-xs ${canAgree ? 'text-green-400' : 'text-amber-400'}`}>
                    {canAgree ? '✅' : '📜'} {canAgree ? '' : readToEndText}
                  </p>
                  <button
                    type="button"
                    className={`inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                        canAgree 
                        ? 'bg-cyan-500 text-slate-900 hover:bg-cyan-400' 
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    }`}
                    onClick={() => {
                        if (canAgree) {
                            onAgree();
                            onClose();
                        }
                    }}
                    disabled={!canAgree}
                  >
                    {agreeText}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
