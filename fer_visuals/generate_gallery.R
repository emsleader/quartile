#!/usr/bin/env Rscript
# FER R Visual Studio 1.0: reproducible journal-grade gallery using aggregates only.
# DOES NOT read or upload respondent-level WBES microdata, nor edit any manuscript.
# Usage: Rscript generate_gallery.R /path/to/inputs /path/to/output
args <- commandArgs(trailingOnly=TRUE)
if(length(args)<2L) stop('Usage: Rscript generate_gallery.R INPUT_DIR OUTPUT_DIR')
if(!requireNamespace('ggplot2',quietly=TRUE)) stop('ggplot2 required; install ggplot2 to generate scientific outputs')
library(ggplot2)
I <- args[1]; O <- args[2]; dir.create(O,recursive=TRUE,showWarnings=FALSE)
for(k in c('pdf','svg','png','tables')) dir.create(file.path(O,k),showWarnings=FALSE)
read <- function(x) read.csv(file.path(I,x),check.names=FALSE,stringsAsFactors=FALSE,fileEncoding='UTF-8')
rates<-read('rates_by_group.csv');flow<-read('sample_flow.csv');trans<-read('matched_transitions.csv')
decomp<-read('fer_decomposition_data.csv');models<-read('model_coefficients.csv');bal<-read('ipw_covariate_balance.csv')
prop<-read('reinterview_propensity_histogram.csv');miss<-read('missingness_audit.csv');surface<-read('Supplement_IPW_sensitivity_grid.csv');main<-read('fer_graphics_data.csv')
NAVY='#14365A'; ORANGE='#AF6138'; GREEN='#2F7161'; SKY='#5985B2'; GREY='#657385'; BLUEP='#EAF1F7'
ink <- function() theme_minimal(base_size=10,base_family='sans') + theme(plot.title=element_text(face='bold',size=12,colour=NAVY),plot.subtitle=element_text(size=8.5,colour=GREY),plot.caption=element_text(size=7,colour=GREY,hjust=0),panel.grid.minor=element_blank(),panel.grid.major.x=element_blank(),legend.position='bottom',legend.title=element_blank(),axis.title=element_text(size=9,colour=NAVY))
registry<-list();nfig<-0L; ntable<-0L
put<-function(p,stem,label,input,width=8.7,height=4.9){
  nfig <<- nfig+1L
  p<-p+ink()+labs(title=label,caption=paste('Source: WBES Hungary four-wave panel; aggregate reconstruction |',input,'| Descriptive unless otherwise noted'))
  for(ext in c('pdf','svg','png')){
    dest=file.path(O,ext,paste0(stem,'.',ext))
    ggsave(filename=dest,plot=p,width=width,height=height,units='in',dpi=if(ext=='png') 400 else 120,limitsize=FALSE,bg='white')
  }
  registry[[length(registry)+1L]] <<- data.frame(number=sprintf('F%02d',nfig),kind='Figure',title=label,stem=stem,source_csv=input,method='R/ggplot2; aggregate evidence',stringsAsFactors=FALSE)
  cat(sprintf('FIGURE %02d: %s\n',nfig,label))
}
put3d <- function(az,name){
  nfig <<- nfig+1L
  xs<-sort(unique(surface$min_propensity));ys<-sort(unique(surface$max_inverse_weight));zmat<-matrix(NA_real_,nrow=length(xs),ncol=length(ys))
  ii<-match(surface$min_propensity,xs);jj<-match(surface$max_inverse_weight,ys);zmat[cbind(ii,jj)]<-surface$matched_change_pp
  if(anyNA(zmat))stop('3D grid is not complete; cannot interpolate silently')
  title<-paste('IPW trimming response surface — viewpoint',az,'degrees')
  for(ext in c('pdf','png','svg')){
    pth<-file.path(O,ext,paste0(name,'.',ext))
    if(ext=='pdf')pdf(pth,width=8.8,height=6.6,useDingbats=FALSE)
    if(ext=='svg')svg(pth,width=8.8,height=6.6)
    if(ext=='png')png(pth,width=2600,height=1950,res=300)
    par(mar=c(4,4,4,1),bg='white',fg=NAVY,cex.axis=.85,cex.lab=.88)
    persp(x=xs,y=ys,z=zmat,theta=az,phi=28,expand=.82,col=adjustcolor(SKY,alpha.f=.50),border='#A1B3C6',xlab='Minimum propensity',ylab='Maximum inverse weight',zlab='Matched change (pp)',ticktype='detailed',main=title,shade=.35)
    mtext('Exploratory sensitivity only; no interval or causal interpretation.',side=1,line=3,cex=.7,col=GREY)
    dev.off()
  }
  registry[[length(registry)+1L]] <<- data.frame(number=sprintf('F%02d',nfig),kind='3D figure',title=title,stem=name,source_csv='Supplement_IPW_sensitivity_grid.csv',method='R graphics::persp; aggregate evidence; exploratory',stringsAsFactors=FALSE)
  cat(sprintf('3D FIGURE %02d: %s\n',nfig,title))
}
# Rate-by-dimension, four distinct presentation types for each descriptive subgroup dimension.
for(dimension in c('sector','size_group','region','foreign_group','age_group')){
  x<-rates[rates$dimension==dimension,]; x$year<-factor(x$year,levels=c(2019,2023));x$group<-factor(x$group,levels=unique(x$group))
  if(!nrow(x))next
  # 1: grouped point/interval, no invented confidence intervals
  p1<-ggplot(x,aes(x=group,y=purchase_pct,colour=year,group=year))+geom_point(size=2.7,position=position_dodge(.38))+coord_flip()+scale_color_manual(values=c(NAVY,ORANGE))+scale_y_continuous(limits=c(0,100),breaks=seq(0,100,20))+labs(x=NULL,y='Purchasing incidence (%)',subtitle='Wave-specific own-sample survey weights; descriptive differences only')
  put(p1,paste0('rates_',dimension,'_grouped'),paste('Weighted purchasing by',dimension,'— grouped dots'),'rates_by_group.csv')
  # 2: slope / line plot by group; differences not causal
  p2<-ggplot(x,aes(x=year,y=purchase_pct,group=group,colour=group))+geom_line(linewidth=.75)+geom_point(size=2.5)+scale_y_continuous(limits=c(0,100))+labs(x=NULL,y='Weighted purchasing (%)',subtitle='Line segments connect different survey samples, not necessarily the same firms')
  put(p2,paste0('rates_',dimension,'_slope'),paste('Weighted purchasing by',dimension,'— survey-wave contrasts'),'rates_by_group.csv')
  # 3: heatmap
  p3<-ggplot(x,aes(x=year,y=group,fill=purchase_pct))+geom_tile(colour='white',linewidth=.8)+geom_text(aes(label=sprintf('%.1f%%',purchase_pct)),size=3.5)+scale_fill_gradient(low='#E5EEF5',high=NAVY,limits=c(0,100))+labs(x=NULL,y=NULL,fill='% purchasing',subtitle='Cells with fewer than 10 observations were suppressed')
  put(p3,paste0('rates_',dimension,'_heatmap'),paste('Weighted purchasing by',dimension,'— heatmap'),'rates_by_group.csv')
  # 4: first differences for groups observed in both waves
  a<-merge(x[as.character(x$year)=='2019',c('group','purchase_pct')],x[as.character(x$year)=='2023',c('group','purchase_pct')],by='group',suffixes=c('_2019','_2023'))
  a$change<-a$purchase_pct_2023-a$purchase_pct_2019
  p4<-ggplot(a,aes(x=reorder(group,change),y=change,fill=change>0))+geom_col(width=.60)+coord_flip()+geom_hline(yintercept=0,linetype='dashed')+scale_fill_manual(values=c(ORANGE,GREEN),guide='none')+labs(x=NULL,y='Difference in percentage points',subtitle='Composition-sensitive descriptive contrasts; no subgroup inference')
  put(p4,paste0('rates_',dimension,'_difference'),paste('2019–2023 contrast by',dimension),'rates_by_group.csv')
}
# Overall rates, 3 alternate perspectives
ov<-rates[rates$dimension=='overall',];ov$year<-factor(ov$year,levels=c(2019,2023))
put(ggplot(ov,aes(x=year,y=purchase_pct,group=1))+geom_line(colour=NAVY,linewidth=1)+geom_point(size=4,colour=NAVY)+geom_text(aes(label=sprintf('%.2f%%',purchase_pct)),vjust=-1)+ylim(0,100)+labs(x='Wave',y='Purchasing incidence (%)',subtitle='Wave-specific weights and eligibility; not a firm-level treatment effect'), 'overall_wave_slope','Weighted purchasing — two cross-sections','rates_by_group.csv')
put(ggplot(ov,aes(x=year,y=purchase_pct,fill=year))+geom_col(width=.5)+geom_text(aes(label=sprintf('%.2f%%',purchase_pct)),vjust=-.5)+scale_fill_manual(values=c(NAVY,ORANGE),guide='none')+ylim(0,100)+labs(x=NULL,y='Weighted percentage'), 'overall_wave_columns','Purchasing incidence by survey wave','rates_by_group.csv')
base_rate=ov$purchase_pct[ov$year==2019];new_rate=ov$purchase_pct[ov$year==2023]
change=data.frame(label='2023 minus 2019',delta=new_rate-base_rate)
put(ggplot(change,aes(x=label,y=delta))+geom_col(fill=GREEN,width=.4)+geom_hline(yintercept=0,linetype=2)+geom_text(aes(label=sprintf('%+.2f pp',delta)),vjust=-.7,size=5)+coord_cartesian(ylim=c(-4,15))+labs(x=NULL,y='Percentage-point difference',subtitle='Different weighted survey populations; not a causal change'), 'overall_wave_change','Net wave-specific difference','rates_by_group.csv')
# Sample flow: raw, eligible, and ineligible
flow$year<-factor(flow$year)
put(ggplot(flow,aes(x=year,y=n,fill=stage))+geom_col(position='dodge')+scale_fill_manual(values=c(GREEN,GREY,ORANGE))+labs(y='Firm-wave records',x='Survey wave',subtitle='Eligibility: 5–99 workers, K.4 valid and positive survey weight'),'sample_flow_grouped','Eligibility audit by survey wave','sample_flow.csv')
f2<-flow[flow$stage!='Raw wave',]
put(ggplot(f2,aes(x=year,y=n,fill=stage))+geom_col(position='stack')+scale_fill_manual(values=c(GREEN,ORANGE))+labs(y='Firm-wave records',x='Survey wave',subtitle='Total stacks reconcile to original 805 (2019) and 831 (2023)'),'sample_flow_stacked','Eligible versus excluded records','sample_flow.csv')
# Paired transition alternatives, n=244
put(ggplot(trans,aes(x=previous,y=current,fill=n))+geom_tile(colour='white',linewidth=1)+geom_text(aes(label=paste0('n = ',n)),size=5)+scale_fill_gradient(low=BLUEP,high=NAVY)+labs(x='2019 purchase',y='2023 purchase',subtitle='Same 244 baseline-eligible establishments'),'matched_transition_heatmap','Matched fixed-asset purchase transitions','matched_transitions.csv')
put(ggplot(trans,aes(x=previous,y=n,fill=current))+geom_col(position='fill',width=.65)+scale_fill_manual(values=c(NAVY,ORANGE))+scale_y_continuous(labels=function(z) paste0(round(z*100),'%'))+labs(x='2019 purchase',y='Conditional 2023 share',subtitle='Paired sample only; the column denominators differ by 2019 outcome'),'matched_transition_stacked','Transition shares conditional on baseline purchase','matched_transitions.csv')
put(ggplot(trans,aes(x=previous,y=n,fill=current))+geom_col(position='dodge',width=.65)+scale_fill_manual(values=c(NAVY,ORANGE))+geom_text(aes(label=n),position=position_dodge(.65),vjust=-.5)+labs(x='2019 purchase',y='Matched firms',subtitle='Discordances determine exact McNemar p-value = 0.1716'),'matched_transition_counts','Matched transition discordances','matched_transitions.csv')
# Decomposition forest and alternative displays
for(frame in unique(decomp$frame)){
 z<-decomp[decomp$frame==frame,];z$component<-factor(z$component,levels=rev(unique(z$component)))
 p<-ggplot(z,aes(y=component,x=estimate_pp))+geom_vline(xintercept=0,linetype='dashed',colour=GREY)+geom_errorbarh(aes(xmin=lower95_pp,xmax=upper95_pp),height=.18,colour=NAVY,linewidth=.8)+geom_point(size=3,colour=ORANGE)+labs(x='Contribution / change (pp)',y=NULL,subtitle='Independent NumPy stratified-firm bootstrap B=2,500; NOT an R bootstrap')
 put(p,paste0('decomposition_forest_',if(frame=='Full frame') 'full' else 'exclusion'),paste('Symmetric decomposition —',frame),'fer_decomposition_data.csv')
}
z<-decomp[decomp$frame=='Full frame',];z<-z[-1,];z$component<-factor(z$component,levels=z$component)
put(ggplot(z,aes(x=component,y=estimate_pp,fill=estimate_pp>0))+geom_col()+scale_fill_manual(values=c(ORANGE,GREEN),guide='none')+geom_hline(yintercept=0)+coord_flip()+labs(x=NULL,y='Contribution (pp)',subtitle='Three accounting components sum to the total wave-specific change'), 'decomposition_components','Full-frame composition accounting','fer_decomposition_data.csv')
zz<-decomp[decomp$component!='Cross-sectional change',]
put(ggplot(zz,aes(x=component,y=estimate_pp,colour=frame,group=frame))+geom_point(position=position_dodge(.45),size=2.5)+geom_errorbar(aes(ymin=lower95_pp,ymax=upper95_pp),position=position_dodge(.45),width=.25)+coord_flip()+geom_hline(yintercept=0,linetype=2)+labs(x=NULL,y='Contribution (pp)',subtitle='Two source frames; 95% independent Python intervals'), 'decomposition_robustness','Sensitivity to excluding 2023 Section M','fer_decomposition_data.csv')
# Coefficient forest plots, distinct statistical scales
for(model in unique(models$model)){
 z<-models[models$model==model & models$term!='Intercept',];z$term<-factor(z$term,levels=rev(z$term))
 p<-ggplot(z,aes(y=term,x=estimate))+geom_vline(xintercept=0,linetype=2,colour=GREY)+geom_errorbarh(aes(xmin=ci_low,xmax=ci_high),height=.18,colour=NAVY)+geom_point(colour=ORANGE,size=2.6)+labs(x=unique(z$scale),y=NULL,subtitle='Independent statsmodels reconstruction on actual WBES panel; original R model run pending')
 put(p,if(model=='Re-interview Logit') 'model_logit_coefficients' else 'model_lpm_coefficients',paste('Coefficient estimates —',model),'model_coefficients.csv',height=5.6)
}
# Covariate balance
bal$covariate<-factor(bal$covariate,levels=rev(unique(bal$covariate)))
put(ggplot(bal,aes(y=covariate,x=smd,colour=method))+geom_vline(xintercept=c(-.1,0,.1),linetype=c(2,1,2),colour=c(GREY,'black',GREY))+geom_point(size=2.2,position=position_dodge(width=.45))+scale_colour_manual(values=c(GREEN,ORANGE))+labs(x='Standardised mean difference',y=NULL,subtitle='Observed baseline balance; no inference regarding unobserved attrition'),'ipw_covariate_balance','Covariate balance before and after IPW','ipw_covariate_balance.csv',height=6.0)
put(ggplot(prop,aes(x=bin_mid,y=n,fill=group))+geom_col(position='dodge',width=.045)+scale_fill_manual(values=c(NAVY,ORANGE))+labs(x='Predicted re-interview probability',y='Number of 2019 baseline firms',subtitle='Aggregated histogram, not respondent-level data'),'logit_propensity_hist','Propensity model fitted probabilities','reinterview_propensity_histogram.csv')
put(ggplot(miss,aes(x=factor(year),y=variable,fill=percent_invalid))+geom_tile(colour='white',linewidth=.8)+geom_text(aes(label=sprintf('%.1f%%',percent_invalid)),size=3.5)+scale_fill_gradient(low=BLUEP,high=ORANGE)+labs(x='Wave',y='WBES variable',fill='Invalid (%)',subtitle='Eligibility/quality audit: invalid includes survey-specific missing or out-of-range values'),'data_missingness_heatmap','Selected source-variable completeness','missingness_audit.csv')
# IPW trimming is exploratory, no intervals and NO causal inference.
put(ggplot(surface,aes(x=min_propensity,y=max_inverse_weight,fill=matched_change_pp))+geom_raster()+scale_fill_gradient2(low=NAVY,mid='white',high=ORANGE,midpoint=-3.5)+labs(x='Minimum propensity retained',y='Maximum inverse-probability weight',fill='Matched change (pp)',subtitle='Exploratory trimming sensitivity; no confidence interval or policy identification'), 'ipw_sensitivity_heatmap','IPW trimming — 2D sensitivity surface','Supplement_IPW_sensitivity_grid.csv')
put(ggplot(surface,aes(x=min_propensity,y=max_inverse_weight,z=matched_change_pp))+geom_contour(colour=NAVY,linewidth=.4)+labs(x='Minimum propensity retained',y='Maximum inverse weight',subtitle='Iso-response contours; exploratory, without statistical uncertainty'), 'ipw_sensitivity_contour','IPW trimming — contours of matched change','Supplement_IPW_sensitivity_grid.csv')
curve<-surface[abs(surface$min_propensity-.1)<.0003,]
put(ggplot(curve,aes(x=max_inverse_weight,y=matched_change_pp))+geom_line(colour=NAVY,linewidth=.9)+labs(x='Maximum inverse weight',y='Adjusted matched change (pp)',subtitle='Propensity floor held near 0.10; exploratory input restrictions only'),'ipw_sensitivity_cap_curve','IPW response to weight truncation','Supplement_IPW_sensitivity_grid.csv')
curve2<-surface[abs(surface$max_inverse_weight-max(surface$max_inverse_weight))<.0003,]
put(ggplot(curve2,aes(x=min_propensity,y=matched_change_pp))+geom_line(colour=GREEN,linewidth=.9)+labs(x='Minimum propensity retained',y='Adjusted matched change (pp)',subtitle='Cap held at largest value; exploratory model sensitivity'),'ipw_sensitivity_propensity_curve','IPW response to propensity floor','Supplement_IPW_sensitivity_grid.csv')
put3d(40,'ipw_3d_perspective_40');put3d(120,'ipw_3d_perspective_120')
# 7 self-contained tables exported both as CSV and readable HTML (not seven independent hypothesis tests)
esc<-function(x) {x<-as.character(x); x<-gsub('&','&amp;',x,fixed=TRUE);x<-gsub('<','&lt;',x,fixed=TRUE);gsub('>','&gt;',x,fixed=TRUE)}
addtable<-function(name,df,source){
  ntable<<-ntable+1L
  write.csv(df,file.path(O,'tables',paste0(name,'.csv')),row.names=FALSE,fileEncoding='UTF-8')
  h<-paste0('<!doctype html><html lang="en"><meta charset="utf-8"><title>',esc(name),'</title><style>body{font:14px/1.5 system-ui,Arial;margin:24px;color:#182f45}h1{font-size:19px}table{border-collapse:collapse;min-width:740px}th{background:#173955;color:white;text-align:left}td,th{padding:8px 12px;border-bottom:1px solid #dae2ec}tr:nth-child(even){background:#f5f8fc}caption{color:#667889;font-size:12px;text-align:left;margin:10px 0}</style><h1>',esc(name),'</h1><table><thead><tr>',paste0('<th>',esc(names(df)),'</th>',collapse=''),'</tr></thead><tbody>',paste(apply(df,1,function(row)paste0('<tr>',paste0('<td>',esc(row),'</td>',collapse=''),'</tr>')),collapse=''),'</tbody><caption>Source: original WBES Hungary panel; aggregate calculation. ',esc(source),'</caption></table></html>')
  writeLines(h,file.path(O,'tables',paste0(name,'.html')),useBytes=TRUE)
  registry[[length(registry)+1L]]<<-data.frame(number=sprintf('T%02d',ntable),kind='Table',title=name,stem=name,source_csv=source,method='R data.table/base formatting from aggregate-only evidence',stringsAsFactors=FALSE)
}
addtable('T01_purchase_rates_all',rates[rates$dimension=='overall',],'rates_by_group.csv')
addtable('T02_rates_by_sector',rates[rates$dimension=='sector',],'rates_by_group.csv')
addtable('T03_rates_by_size',rates[rates$dimension=='size_group',],'rates_by_group.csv')
addtable('T04_rates_by_region',rates[rates$dimension=='region',],'rates_by_group.csv')
addtable('T05_sample_flow',flow,'sample_flow.csv')
addtable('T06_matched_transitions',trans,'matched_transitions.csv')
addtable('T07_model_estimates',models,'model_coefficients.csv')
reg<-do.call(rbind,registry)
write.csv(reg,file.path(O,'OUTPUT_INDEX.csv'),row.names=FALSE,fileEncoding='UTF-8')
# Audit selected identities in actual R. Running visuals is not a full raw-data R replication.
wave<-rates[rates$dimension=='overall',];delta<-wave$purchase_pct[wave$year==2023]-wave$purchase_pct[wave$year==2019]
stopifnot(abs(delta-9.35077318)<1e-3)
stopifnot(sum(trans$n)==244L)
stopifnot(all(c('Full frame','Without 2023 Section M') %in% decomp$frame))
for(frame in unique(decomp$frame)){
 k<-decomp[decomp$frame==frame,];stopifnot(abs(k$estimate_pp[1]-sum(k$estimate_pp[-1]))<1e-5)
}
stopifnot(nrow(reg)==50L)
writeLines(capture.output(sessionInfo()),file.path(O,'R_sessionInfo.txt'))
writeLines(c(paste('figures',nfig),paste('tables',ntable),'source=WBS original Stata, SHA256 973e1fb3cbf09e78be671aef28be70f4bfe2815e7a74c57406bbcb450142ecdc','CAUTION: Figures rendered in actual R; the estimators for models and uncertainty were independently precomputed in Python; ORIGINAL 6 R ESTIMATOR SCRIPTS NOT RUN.'),file.path(O,'VALIDATION_STATUS.txt'))
cat(sprintf('SUCCESS: %s outputs (figures=%s; tables=%s)\n',nrow(reg),nfig,ntable))
