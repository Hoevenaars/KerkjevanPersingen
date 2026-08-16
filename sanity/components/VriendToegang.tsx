import {Card, Text} from '@sanity/ui'
import {useCurrentUser, type DocumentLayoutProps} from 'sanity'
import {isWebmaster} from '../lib/rollen'

/**
 * Extra drempel als iemand via zoeken of een URL bij een vriend-document komt.
 * De API laat Editors het document nog wel ophalen; dit verbergt alleen de Studio-UI.
 */
export function VriendToegang(props: DocumentLayoutProps) {
  const user = useCurrentUser()

  if (props.documentType === 'vriend' && !isWebmaster(user)) {
    return (
      <Card padding={4} radius={2} tone="caution">
        <Text>
          De vriendenlijst is alleen zichtbaar voor de webmaster, vanwege de
          privacy van de aanmeldingen.
        </Text>
      </Card>
    )
  }

  return props.renderDefault(props)
}
