function Lines({count,columns = 2}) {
  return Array.from({length:count}, (_,index) => <div className="placeholder-row" key={index}>
    {Array.from({length:columns}, (_,column) => <span className="placeholder" key={column}/>)}
  </div>);
}

export function ListLoading({log = false,label}) {
  return <div role="status" className="list-loading">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className={log ? 'table-placeholders' : 'record-placeholders'}><Lines count={log ? 5 : 3} columns={log ? 5 : 2}/></div>
  </div>;
}

export function DashboardLoading({page}) {
  const overview = page === 'Overview';
  const title = overview ? 'Backend overview' : page;
  return <><div className="pagehead"><h1>{title}</h1></div>
    {overview ? <div role="status">
      <span className="sr-only">Loading backend overview</span>
      <div aria-hidden="true"><div className="metrics">{['API requests','Mean response','95th percentile','Server errors'].map(label =>
        <div key={label}><small>{label}</small><span className="placeholder metric-placeholder"/></div>)}</div>
        <div className="overview-grid"><section className="panel"><h2>Request latency</h2><div className="chart-placeholder"/></section>
        <section className="panel"><h2>Runtime</h2><Lines count={4}/></section></div>
      </div></div> : <section className="directory"><ListLoading log={page === 'Request log'} label={'Loading '+page.toLowerCase()}/></section>}
  </>;
}
