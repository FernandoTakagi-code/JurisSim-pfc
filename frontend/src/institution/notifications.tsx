import {useState} from 'react';
import {useResource,ResourceState,Pages} from '../administration';
import type {Page} from './types';
import {date} from './format';

export function Notifications({recent=false}:{recent?:boolean}={}) {
  const [page, setPage] = useState(1);
  const resource = useResource<
    Page<{ id: string; message: string; createdAt: string }>
  >(`/institutions/notifications?page=${page}`);
  if(recent&&resource.data?.items.length===0)return null;
  return (
    <section className="panel">
      {recent&&<h2>Notificações recentes</h2>}
      <p>
        Mensagens destinadas à sua conta, incluindo suas instituições.
      </p>
      <ResourceState resource={resource} />
      {resource.data?.items.length === 0 && <p>Nenhuma notificação.</p>}
      {resource.data?.items.map((n) => (
        <article className="institution-notification" key={n.id}>
          <h2>{n.message}</h2>
          <time>{date(n.createdAt)}</time>
        </article>
      ))}
      <Pages page={page} hasMore={resource.data?.hasMore} change={setPage} />
    </section>
  );
}
